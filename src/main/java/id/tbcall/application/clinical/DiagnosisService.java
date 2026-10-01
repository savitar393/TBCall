package id.tbcall.application.clinical;

import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class DiagnosisService {
    private final EntityManager em;
    private final ClinicalAccess access;
    private final ClinicalValidation validation;
    private final ClinicalSourceAuthorityPolicy source;
    private final ClinicalViews views;
    private final AuditService audit;
    public DiagnosisService(EntityManager em,ClinicalAccess access,ClinicalValidation validation,ClinicalSourceAuthorityPolicy source,ClinicalViews views,AuditService audit) {
        this.em=em; this.access=access; this.validation=validation; this.source=source; this.views=views; this.audit=audit;
    }
    public DiagnosisView create(CurrentActor actor,UUID registrationId,DiagnosisInput input,String match) {
        TBRegistration registration=access.registration(actor,"DIAGNOSIS_WRITE",registrationId,true); IfMatch.require(match,registration.getVersion());
        if(!Set.of("OPEN","DIAGNOSED").contains(registration.getStatus())) throw ClinicalErrors.state();
        source.requireLocalCreate(actor,"DIAGNOSIS_WRITE",registration.getFacility().getId(),"DIAGNOSIS");
        Diagnosis diagnosis=new Diagnosis(); diagnosis.setRegistration(registration); validation.mergeDiagnosis(diagnosis,input); validation.diagnosis(diagnosis);
        if("OPEN".equals(registration.getStatus())) registration.setStatus("DIAGNOSED");
        else em.lock(registration,LockModeType.PESSIMISTIC_FORCE_INCREMENT);
        em.persist(diagnosis); ClinicalErrors.flush(em); audit.record(actor.userId(),"DIAGNOSIS_RECORDED","DIAGNOSIS",diagnosis.getId()); return views.diagnosis(diagnosis);
    }
    public DiagnosisView update(CurrentActor actor,UUID id,DiagnosisInput input,String match) {
        UUID registrationId=access.diagnosisRegistration(actor,id);
        TBRegistration registration=access.registration(actor,"DIAGNOSIS_WRITE",registrationId,true);
        // Same registration-before-diagnosis lock order as case confirmation.
        Diagnosis diagnosis=em.find(Diagnosis.class,id,LockModeType.PESSIMISTIC_WRITE); IfMatch.require(match,diagnosis.getVersion());
        if(!"DIAGNOSED".equals(registration.getStatus()) || em.createQuery("select count(c) from TBCase c where c.confirmingDiagnosis.id=:id",Long.class).setParameter("id",id).getSingleResult()>0)
            throw ClinicalErrors.state();
        source.requireLocalEdit(actor,"DIAGNOSIS_WRITE",registration.getFacility().getId(),"DIAGNOSIS",id);
        validation.mergeDiagnosis(diagnosis,input); validation.diagnosis(diagnosis);
        ClinicalErrors.flush(em); audit.record(actor.userId(),"DIAGNOSIS_UPDATED","DIAGNOSIS",id); return views.diagnosis(diagnosis);
    }
}
