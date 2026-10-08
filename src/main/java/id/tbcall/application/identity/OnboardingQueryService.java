package id.tbcall.application.identity;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.authorization.ScopePolicies;
import id.tbcall.persistence.entity.PatientSupporter;
import id.tbcall.persistence.entity.PatientUserLink;
import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.identity.OnboardingDtos.*;

@Service
@Transactional(readOnly=true)
public class OnboardingQueryService {
    private final EntityManager em;
    private final ScopePolicies scopes;
    private final OnboardingAccess access;
    public OnboardingQueryService(EntityManager em,ScopePolicies scopes,OnboardingAccess access) { this.em=em;this.scopes=scopes;this.access=access; }
    public Versioned<PatientState> patient(CurrentActor actor,UUID patientId) {
        scopes.requireOfficerPatientLinkScope(actor,"PATIENT_LINK_VERIFY",patientId);
        var rows=em.createQuery("select l from PatientUserLink l join fetch l.user where l.patient.id=:patient and l.relationshipType='SELF' and l.verificationStatus='VERIFIED'",PatientUserLink.class)
                .setParameter("patient",patientId).getResultList();
        if(rows.isEmpty()) return new Versioned<>(new PatientState(null),null);
        var row=rows.getFirst();
        return new Versioned<>(new PatientState(new PatientLinkState(row.getId(),patientId,row.getUser().getId(),row.getRelationshipType(),
                row.getVerificationStatus(),OnboardingViews.account(row.getUser()))),row.getVersion());
    }
    public Versioned<PairState> pair(CurrentActor actor,UUID patientId,UUID userId) {
        scopes.requireOfficerPatientLinkScope(actor,"PATIENT_LINK_VERIFY",patientId);
        var rows=em.createQuery("select l from PatientUserLink l where l.patient.id=:patient and l.user.id=:user and l.relationshipType='SELF'",PatientUserLink.class)
                .setParameter("patient",patientId).setParameter("user",userId).getResultList();
        if(rows.isEmpty()) return new Versioned<>(new PairState(patientId,userId,null),null);
        var row=rows.getFirst();return new Versioned<>(new PairState(patientId,userId,new Pair(row.getId(),row.getVerificationStatus())),row.getVersion());
    }
    public SupporterPage supporters(CurrentActor actor,UUID caseId,int page,int size) {
        access.tbCase(actor,caseId,false,false);
        if(page<0 || size<1 || size>50 || (long)page*size>Integer.MAX_VALUE) throw ApplicationFailure.invalid("Halaman tidak valid.");
        var rows=em.createQuery("select s from PatientSupporter s where s.tbCase.id=:case order by s.id",PatientSupporter.class)
                .setParameter("case",caseId).setFirstResult(page*size).setMaxResults(size).getResultList();
        long count=em.createQuery("select count(s) from PatientSupporter s where s.tbCase.id=:case",Long.class).setParameter("case",caseId).getSingleResult();
        return new SupporterPage(rows.stream().map(OnboardingViews::summary).toList(),page,size,count);
    }
    public SupporterDetail supporter(CurrentActor actor,UUID caseId,UUID id) {
        access.tbCase(actor,caseId,false,false);return OnboardingViews.detail(access.supporter(caseId,id,false));
    }
}
