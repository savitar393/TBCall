package id.tbcall.application.identity;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.authorization.ScopePolicies;
import id.tbcall.persistence.entity.User;
import id.tbcall.security.IdentityNormalizer;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.UUID;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.identity.OnboardingDtos.*;

/** One independently committed lookup outcome also reserves the deployment-wide budget. */
@Service
public class AccountResolutionTransaction {
    private final EntityManager em;
    private final ScopePolicies scopes;
    private final OnboardingAccess access;
    private final AuditService audit;
    public AccountResolutionTransaction(EntityManager em,ScopePolicies scopes,OnboardingAccess access,AuditService audit) {
        this.em=em;this.scopes=scopes;this.access=access;this.audit=audit;
    }
    public record Outcome(Candidate candidate,ApplicationFailure failure) {}
    @Transactional(propagation=Propagation.REQUIRES_NEW,isolation=Isolation.READ_COMMITTED)
    public Outcome resolve(CurrentActor actor,UUID patientId,UUID caseId,UUID supporterId,String identity) {
        String contextType;UUID context;
        if(patientId!=null) {
            scopes.requireOfficerPatientLinkScope(actor,"PATIENT_LINK_VERIFY",patientId);
            contextType="PATIENT";context=patientId;
        } else {
            access.tbCase(actor,caseId,true,true);access.supporter(caseId,supporterId,true);
            contextType="PATIENT_SUPPORTER";context=supporterId;
        }
        // All instances serialize through this existing row. No outer transaction holds this user lock.
        em.find(User.class,actor.userId(),LockModeType.PESSIMISTIC_WRITE);
        OffsetDateTime cutoff=databaseNow().minusMinutes(15);
        if(attempts(actor.userId(),null,null,cutoff,10)>=10 || attempts(actor.userId(),contextType,context,cutoff,5)>=5)
            return outcome(actor,contextType,context,"THROTTLED",null,new ApplicationFailure(429,"ACCOUNT_RESOLUTION_LIMIT","Batas pencarian tercapai",
                    "Batas pencarian akun tercapai. Coba kembali nanti."));
        String normalized;
        try {normalized=IdentityNormalizer.login(identity);}
        catch(ApplicationFailure failure) {return outcome(actor,contextType,context,"INVALID",null,failure);}
        boolean email=normalized.contains("@");
        var users=em.createQuery("select u from User u where "+(email?"u.email":"u.phone")+"=:identity",User.class)
                .setParameter("identity",normalized).getResultList();
        User user=users.isEmpty()?null:users.getFirst();
        boolean eligible=user!=null && "ACTIVE".equals(user.getStatus()) && (email?user.getEmailVerifiedAt()!=null:user.getPhoneVerifiedAt()!=null);
        if(eligible && patientId!=null) eligible=em.createQuery("select count(l) from PatientUserLink l where l.user.id=:user and l.relationshipType='SELF' and l.verificationStatus='VERIFIED'",Long.class)
                .setParameter("user",user.getId()).getSingleResult()==0;
        if(!eligible) return outcome(actor,contextType,context,"UNAVAILABLE",null,ApplicationFailure.missing());
        Candidate candidate=new Candidate(user.getId(),new MatchedLogin(email?"EMAIL":"PHONE",email?OnboardingViews.email(normalized):OnboardingViews.phone(normalized)));
        return outcome(actor,contextType,context,"AVAILABLE",candidate,null);
    }
    private long attempts(UUID actor,String type,UUID context,OffsetDateTime cutoff,int limit) {
        // Existing idx_audit_logs_actor(actor_user_id,occurred_at DESC) bounds the scan to the actor/window.
        // LIMIT bounds even an abusive actor's rejected-attempt scan; DB time is shared across instances.
        String sql="select count(*) from (select 1 from audit_logs where actor_user_id=:actor and occurred_at > :cutoff "
                +"and action in ('ACCOUNT_RESOLUTION_AVAILABLE','ACCOUNT_RESOLUTION_UNAVAILABLE','ACCOUNT_RESOLUTION_INVALID','ACCOUNT_RESOLUTION_THROTTLED') "
                +(context==null?"":"and entity_type=:type and entity_id=:context ")+"limit "+limit+") attempts";
        var query=em.createNativeQuery(sql).setParameter("actor",actor).setParameter("cutoff",cutoff);
        if(context!=null)query.setParameter("type",type).setParameter("context",context);
        return ((Number)query.getSingleResult()).longValue();
    }
    private Outcome outcome(CurrentActor actor,String type,UUID context,String suffix,Candidate candidate,ApplicationFailure failure) {
        audit.recordAt(actor.userId(),"ACCOUNT_RESOLUTION_"+suffix,type,context,databaseNow());
        em.flush();
        return new Outcome(candidate,failure);
    }
    private OffsetDateTime databaseNow() {
        return (OffsetDateTime)em.createNativeQuery("select clock_timestamp()",OffsetDateTime.class).getSingleResult();
    }
}
