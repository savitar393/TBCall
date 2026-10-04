package id.tbcall.application.treatment;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalValidation.text;
import static id.tbcall.application.treatment.TreatmentDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class AdherenceService {
    private static final Set<String> STAFF=Set.of("TAKEN_OBSERVED","TAKEN_SELF_REPORTED","DISPENSED_HOME","MISSED","UNKNOWN");
    private static final Set<String> PATIENT=Set.of("TAKEN_SELF_REPORTED","MISSED","UNKNOWN");
    private static final Set<String> SUPPORTER=Set.of("TAKEN_OBSERVED","TAKEN_SELF_REPORTED","MISSED","UNKNOWN");
    private final EntityManager em; private final TreatmentAccess access; private final TreatmentViews views; private final AuditService audit; private final Clock clock;
    public AdherenceService(EntityManager em,TreatmentAccess access,TreatmentViews views,AuditService audit,Clock clock) { this.em=em; this.access=access; this.views=views; this.audit=audit; this.clock=clock; }
    public DoseView staff(CurrentActor actor,UUID id,DoseInput input) { return views.dose(record(actor,access.staff(actor,"ADHERENCE_RECORD",id,true),input,STAFF,"HEALTH_WORKER")); }
    public SafeDose patient(CurrentActor actor,DoseInput input) { return views.safeDose(record(actor,access.self(actor,"ADHERENCE_RECORD",true),input,PATIENT,"PATIENT")); }
    public SafeDose supporter(CurrentActor actor,UUID caseId,DoseInput input) { return views.safeDose(record(actor,access.supporting(actor,"ADHERENCE_RECORD",caseId,true),input,SUPPORTER,"TREATMENT_SUPPORTER")); }
    private DoseEvent record(CurrentActor actor,Treatment treatment,DoseInput input,Set<String> statuses,String source) {
        access.requireActive(treatment);
        String status=text(input.status()),mode=text(input.administrationMode());
        if(!statuses.contains(status)) throw ApplicationFailure.invalid("Status laporan dosis tidak diizinkan pada jalur ini.");
        if(mode!=null && !Set.of("DIRECTLY_OBSERVED","SELF_ADMINISTERED","OTHER").contains(mode)) throw ApplicationFailure.invalid("Cara pemberian obat tidak dikenal.");
        if(input.scheduledDate().isBefore(treatment.getStartDate()) || input.scheduledDate().isAfter(LocalDate.now(clock))) throw ApplicationFailure.invalid("Tanggal dosis harus antara mulai pengobatan dan hari ini.");
        if(em.createQuery("select count(d) from DoseEvent d where d.treatment.id=:treatment and d.scheduledDate=:date and d.recordedByUser.id=:actor",Long.class)
                .setParameter("treatment",treatment.getId()).setParameter("date",input.scheduledDate()).setParameter("actor",actor.userId()).getSingleResult()>0) throw TreatmentErrors.duplicateDose();
        DoseEvent event=new DoseEvent(); event.setTreatment(treatment); event.setScheduledDate(input.scheduledDate()); event.setRecordedAt(OffsetDateTime.now(clock)); event.setStatus(status); event.setAdministrationMode(mode); event.setSource(source); event.setRecordedByUser(em.getReference(User.class,actor.userId())); event.setNotes(text(input.notes()));
        em.persist(event); TreatmentErrors.flush(em); audit.record(actor.userId(),"DOSE_EVENT_RECORDED","DOSE_EVENT",event.getId()); return event;
    }
}
