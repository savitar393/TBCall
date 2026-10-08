package id.tbcall.application.identity;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.authorization.ScopePolicies;
import id.tbcall.persistence.entity.PatientSupporter;
import id.tbcall.persistence.entity.TBCase;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class OnboardingAccess {
    private final EntityManager em;
    private final ScopePolicies scopes;
    public OnboardingAccess(EntityManager em,ScopePolicies scopes) { this.em=em;this.scopes=scopes; }
    public TBCase tbCase(CurrentActor actor,UUID id,boolean lock,boolean prospective) {
        TBCase row=lock ? em.find(TBCase.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(TBCase.class,id);
        if(row==null) throw ApplicationFailure.missing();
        // Lock acquisition precedes hydration/scope evaluation: a concurrent transfer cannot leave stale ownership.
        scopes.requireOfficerCase(actor,"SUPPORTER_LINK_MANAGE",row);
        if(!Boolean.TRUE.equals(row.getCurrentFacility().getActive())) throw ApplicationFailure.forbidden();
        if(prospective && !Set.of("ACTIVE","REFERRED").contains(row.getStatus()))
            throw ApplicationFailure.conflict("Status kasus tidak mengizinkan penautan baru.");
        return row;
    }
    public PatientSupporter supporter(UUID caseId,UUID id,boolean requireActive) {
        PatientSupporter row=em.find(PatientSupporter.class,id);
        if(row==null || !row.getTbCase().getId().equals(caseId)) throw ApplicationFailure.missing();
        if(requireActive && !Boolean.TRUE.equals(row.getActive())) throw ApplicationFailure.conflict("Pendamping tidak aktif.");
        return row;
    }
}
