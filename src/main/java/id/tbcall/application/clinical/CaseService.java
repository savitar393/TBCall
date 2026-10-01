package id.tbcall.application.clinical;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class CaseService {
    private final EntityManager em;
    private final ClinicalAccess access;
    private final ClinicalValidation validation;
    private final ClinicalSourceAuthorityPolicy source;
    private final ClinicalViews views;
    private final AuditService audit;
    private final Clock clock;
    public CaseService(EntityManager em,ClinicalAccess access,ClinicalValidation validation,ClinicalSourceAuthorityPolicy source,ClinicalViews views,AuditService audit,Clock clock) {
        this.em=em; this.access=access; this.validation=validation; this.source=source; this.views=views; this.audit=audit; this.clock=clock;
    }
    public CaseView confirm(CurrentActor actor,UUID registrationId,CaseConfirm input,String match) {
        TBRegistration registration=access.registration(actor,"CASE_WRITE",registrationId,true); IfMatch.require(match,registration.getVersion());
        if(!"DIAGNOSED".equals(registration.getStatus()) || em.createQuery("select count(c) from TBCase c where c.registration.id=:id",Long.class).setParameter("id",registrationId).getSingleResult()>0)
            throw ClinicalErrors.state();
        var found=em.createQuery("select d from Diagnosis d where d.id=:id and d.registration.id=:registration",Diagnosis.class)
                .setParameter("id",input.getDiagnosisId()).setParameter("registration",registrationId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        if(found.isEmpty()) throw ApplicationFailure.invalid("Diagnosis harus berasal dari registrasi yang sama.");
        Diagnosis diagnosis=found.getFirst();
        if(diagnosis.getAnatomicalSiteCode()==null || diagnosis.getDiagnosisTypeCode()==null) throw ApplicationFailure.invalid("Diagnosis harus memiliki lokasi anatomi dan jenis diagnosis.");
        source.requireLocalCreate(actor,"CASE_WRITE",registration.getFacility().getId(),"TB_CASE");
        TBCase tbCase=new TBCase(); tbCase.setRegistration(registration); tbCase.setConfirmingDiagnosis(diagnosis); tbCase.setCurrentFacility(registration.getFacility());
        validation.mergeCase(tbCase,input); validation.tbCase(tbCase); tbCase.setConfirmedAt(OffsetDateTime.now(clock)); tbCase.setStatus("ACTIVE");
        registration.setStatus("CONVERTED_TO_CASE"); em.persist(tbCase);
        ClinicalErrors.flush(em); audit.record(actor.userId(),"TB_CASE_CONFIRMED","TB_CASE",tbCase.getId()); return views.tbCase(tbCase);
    }
    public CaseView update(CurrentActor actor,UUID id,CaseInput input,String match) {
        TBCase tbCase=access.tbCase(actor,"CASE_WRITE",id); IfMatch.require(match,tbCase.getVersion());
        if(!Set.of("ACTIVE","REFERRED").contains(tbCase.getStatus())) throw ClinicalErrors.state();
        source.requireLocalEdit(actor,"CASE_WRITE",tbCase.getCurrentFacility().getId(),"TB_CASE",id);
        validation.mergeCase(tbCase,input); validation.tbCase(tbCase);
        ClinicalErrors.flush(em); audit.record(actor.userId(),"TB_CASE_UPDATED","TB_CASE",id); return views.tbCase(tbCase);
    }
}
