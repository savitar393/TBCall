package id.tbcall.application.treatment;

import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalValidation.text;
import static id.tbcall.application.treatment.TreatmentDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class TreatmentService {
    private final EntityManager em; private final TreatmentAccess access; private final TreatmentValidation validation;
    private final ClinicalSourceAuthorityPolicy source; private final TreatmentViews views; private final AuditService audit; private final Clock clock;
    public TreatmentService(EntityManager em,TreatmentAccess access,TreatmentValidation validation,ClinicalSourceAuthorityPolicy source,TreatmentViews views,AuditService audit,Clock clock) {
        this.em=em; this.access=access; this.validation=validation; this.source=source; this.views=views; this.audit=audit; this.clock=clock;
    }
    public TreatmentDetail start(CurrentActor actor,UUID caseId,StartInput input) {
        TBCase owner=access.staffCase(actor,"TREATMENT_WRITE",caseId,true);
        access.facility(actor,"TREATMENT_WRITE",owner.getCurrentFacility().getId());
        if(!"ACTIVE".equals(owner.getStatus()) || em.createQuery("select count(t) from Treatment t where t.tbCase.id=:id and t.status in ('PLANNED','ACTIVE','PAUSED')",Long.class).setParameter("id",caseId).getSingleResult()>0 || hasOutcome(caseId)) throw TreatmentErrors.state();
        source.requireLocalCreate(actor,"TREATMENT_WRITE",owner.getCurrentFacility().getId(),"TREATMENT");
        validation.startDate(owner,input.getStartDate());
        Treatment treatment=new Treatment(); treatment.setTbCase(owner); treatment.setFacility(owner.getCurrentFacility()); treatment.setStatus("ACTIVE");
        treatment.setRegimen(validation.regimen(input.getRegimenCode(),owner.getCaseCategoryCode())); treatment.setStartDate(input.getStartDate());
        validation.merge(treatment,input); validation.plan(treatment);
        var drugs=validation.drugs(treatment,input.getDrugs()); em.persist(treatment); drugs.forEach(em::persist);
        TreatmentErrors.flush(em); audit.record(actor.userId(),"TREATMENT_STARTED","TREATMENT",treatment.getId()); return views.staff(treatment,actor.permissions());
    }
    public TreatmentDetail update(CurrentActor actor,UUID id,MetadataInput input,String match) {
        Treatment treatment=access.staff(actor,"TREATMENT_WRITE",id,true); IfMatch.require(match,treatment.getVersion()); access.requireActive(treatment);
        source.requireLocalEdit(actor,"TREATMENT_WRITE",treatment.getFacility().getId(),"TREATMENT",id);
        long before=treatment.getVersion(); validation.merge(treatment,input); validation.plan(treatment); advance(treatment,before);
        audit.record(actor.userId(),"TREATMENT_UPDATED","TREATMENT",id); return views.staff(treatment,actor.permissions());
    }
    public OutcomeView outcome(CurrentActor actor,UUID id,OutcomeInput input,String match) {
        // Access takes a scalar scope lookup, then TBCase PESSIMISTIC_WRITE, then Treatment PESSIMISTIC_WRITE.
        // The same case lock is taken by Phase 3A follow-up result correction.
        Treatment treatment=access.staff(actor,"OUTCOME_WRITE",id,true); IfMatch.require(match,treatment.getVersion());
        TBCase owner=treatment.getTbCase(); access.requireActive(treatment);
        if(!"ACTIVE".equals(owner.getStatus()) || hasOutcome(owner.getId())) throw TreatmentErrors.state();
        source.requireLocalEdit(actor,"OUTCOME_WRITE",treatment.getFacility().getId(),"TREATMENT",id); validation.outcome(treatment,input);
        TreatmentOutcome outcome=new TreatmentOutcome(); outcome.setTreatment(treatment); outcome.setOutcomeCode(text(input.outcomeCode())); outcome.setOutcomeDate(input.outcomeDate()); outcome.setNotes(text(input.notes()));
        em.persist(outcome); treatment.setActualEndDate(input.outcomeDate()); treatment.setStatus("COMPLETED"); owner.setStatus("COMPLETED"); owner.setClosedAt(OffsetDateTime.now(clock));
        TreatmentErrors.flush(em); audit.record(actor.userId(),"TREATMENT_OUTCOME_RECORDED","TREATMENT_OUTCOME",outcome.getId()); return views.outcome(outcome);
    }
    private boolean hasOutcome(UUID caseId) { return em.createQuery("select count(o) from TreatmentOutcome o where o.treatment.tbCase.id=:id",Long.class).setParameter("id",caseId).getSingleResult()>0; }
    public void advance(Treatment treatment,long before) { TreatmentErrors.flush(em); if(treatment.getVersion()==before) em.lock(treatment,LockModeType.PESSIMISTIC_FORCE_INCREMENT); em.flush(); }
}
