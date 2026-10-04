package id.tbcall.application.treatment;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalValidation.text;
import static id.tbcall.application.treatment.TreatmentDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class FollowUpService {
    private final EntityManager em; private final TreatmentAccess access; private final TreatmentValidation validation;
    private final TreatmentService treatments; private final ClinicalSourceAuthorityPolicy source; private final TreatmentViews views; private final AuditService audit;
    public FollowUpService(EntityManager em,TreatmentAccess access,TreatmentValidation validation,TreatmentService treatments,ClinicalSourceAuthorityPolicy source,TreatmentViews views,AuditService audit) {
        this.em=em; this.access=access; this.validation=validation; this.treatments=treatments; this.source=source; this.views=views; this.audit=audit;
    }
    public FollowUpView schedule(CurrentActor actor,UUID id,ScheduleInput input,String match) {
        Treatment treatment=access.staff(actor,"FOLLOW_UP_WRITE",id,true); IfMatch.require(match,treatment.getVersion()); access.requireActive(treatment);
        Facility facility=access.facility(actor,"FOLLOW_UP_WRITE",input.facilityId()==null ? treatment.getFacility().getId() : input.facilityId());
        source.requireLocalCreate(actor,"FOLLOW_UP_WRITE",facility.getId(),"FOLLOW_UP");
        FollowUp follow=new FollowUp(); follow.setTreatment(treatment); follow.setFollowUpType(text(input.followUpType())); follow.setScheduledAt(input.scheduledAt()); follow.setFacility(facility); follow.setStatus("SCHEDULED"); follow.setNotes(text(input.notes()));
        long before=treatment.getVersion(); em.persist(follow); treatments.advance(treatment,before);
        audit.record(actor.userId(),"FOLLOW_UP_SCHEDULED","FOLLOW_UP",follow.getId()); return views.followUp(follow);
    }
    public FollowUpView complete(CurrentActor actor,UUID id,CompleteInput input,String match) {
        UUID parent=access.childTreatment(actor,"FOLLOW_UP_WRITE","FollowUp",id); Treatment treatment=access.staff(actor,"FOLLOW_UP_WRITE",parent,true);
        FollowUp follow=em.find(FollowUp.class,id,LockModeType.PESSIMISTIC_WRITE); IfMatch.require(match,follow.getVersion()); access.requireActive(treatment);
        if(!"SCHEDULED".equals(follow.getStatus())) throw TreatmentErrors.state();
        if(follow.getFacility()==null) throw ApplicationFailure.missing();
        access.facility(actor,"FOLLOW_UP_WRITE",follow.getFacility().getId());
        source.requireLocalEdit(actor,"FOLLOW_UP_WRITE",follow.getFacility().getId(),"FOLLOW_UP",id);
        validation.notFuture(input.completedAt());
        if(input.completedAt().isBefore(follow.getScheduledAt())) throw ApplicationFailure.invalid("Waktu selesai tidak boleh sebelum jadwal tindak lanjut.");
        follow.setCompletedAt(input.completedAt()); follow.setWeightKg(input.weightKg()); follow.setSymptomSummary(text(input.symptomSummary())); follow.setAdherenceAssessment(text(input.adherenceAssessment()));
        follow.setNotes(text(input.notes())); follow.setStatus("COMPLETED"); follow.setHealthWorker(em.getReference(User.class,actor.userId()));
        TreatmentErrors.flush(em); audit.record(actor.userId(),"FOLLOW_UP_COMPLETED","FOLLOW_UP",id); return views.followUp(follow);
    }
}
