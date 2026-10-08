package id.tbcall.application.identity;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.ClinicalSourceAuthorityPolicy;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.PatientSupporter;
import jakarta.persistence.EntityManager;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.identity.OnboardingDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class SupporterOnboardingService {
    private final EntityManager em;
    private final OnboardingAccess access;
    private final ClinicalSourceAuthorityPolicy authority;
    private final AuditService audit;
    public SupporterOnboardingService(EntityManager em,OnboardingAccess access,ClinicalSourceAuthorityPolicy authority,AuditService audit) {
        this.em=em;this.access=access;this.authority=authority;this.audit=audit;
    }
    public SupporterDetail create(CurrentActor actor,UUID caseId,SupporterInput input) {
        var owner=access.tbCase(actor,caseId,true,true);
        // This local domain write respects the existing explicit CLINICAL authority on its source case.
        authority.requireLocalEdit(actor,"SUPPORTER_LINK_MANAGE",owner.getCurrentFacility().getId(),"TB_CASE",caseId);
        String name=input.fullName()==null ? null : input.fullName().strip();
        if(input.supporterType()==null || !Set.of("PMO","COMPANION").contains(input.supporterType()) || name==null || name.isBlank() || name.length()>255
                || (input.phone()!=null && input.phone().length()>30)) throw ApplicationFailure.invalid("Data pendamping tidak valid.");
        var row=new PatientSupporter();row.setTbCase(owner);row.setSupporterType(input.supporterType());row.setFullName(name);
        row.setPhone(input.phone());row.setActive(true);em.persist(row);em.flush();
        audit.record(actor.userId(),"SUPPORTER_CREATED","PATIENT_SUPPORTER",row.getId());
        return OnboardingViews.detail(row);
    }
}
