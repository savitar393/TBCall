package id.tbcall.application.reminder;

import id.tbcall.application.common.AuditService;
import id.tbcall.application.treatment.MedicationOccurrenceService;
import id.tbcall.persistence.entity.Treatment;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.reminder.ReminderStore.*;

@Service
public class ReminderPlanningWorker {
    private final ReminderStore store;private final ReminderEligibility eligibility;private final MedicationOccurrenceService occurrences;
    private final EntityManager em;private final Clock clock;private final ReminderProperties properties;private final AuditService audit;
    public ReminderPlanningWorker(ReminderStore store,ReminderEligibility eligibility,MedicationOccurrenceService occurrences,EntityManager em,Clock clock,ReminderProperties properties,AuditService audit){this.store=store;this.eligibility=eligibility;this.occurrences=occurrences;this.em=em;this.clock=clock;this.properties=properties;this.audit=audit;}
    @Transactional(propagation=Propagation.REQUIRES_NEW,isolation=Isolation.READ_COMMITTED)
    public int plan(UUID schedule,UUID treatmentId,UUID user,int budget){
        var id=eligibility.lock(treatmentId,user,schedule);var p=store.preference(user,true);
        Instant now=clock.instant();
        // Rotate even ineligible candidates; one stale binding must not starve other enrolled patients.
        if(p!=null)store.jdbc().update("update reminder_preferences set last_planned_at=? where user_id=?",at(now),user);
        if(id==null || !id.active() || !id.patientRole() || !id.verifiedPhone() || !bound(p,id) || !(p.whatsapp() || p.sms()))return 0;
        var treatment=em.find(Treatment.class,treatmentId);
        if(treatment==null || !"ACTIVE".equals(treatment.getStatus()) || !"ACTIVE".equals(treatment.getTbCase().getStatus()))return 0;
        Instant start=now.minusSeconds(properties.getMaxLatenessMinutes()*60L),end=now.plusSeconds(properties.getPlanningHours()*3600L);
        int inserted=0;
        // Every supported zone offset is within 18 hours. One bounded calendar read covers all local dates.
        for(var o:occurrences.calendar(treatment,start.atZone(ZoneOffset.UTC).toLocalDate().minusDays(1),end.atZone(ZoneOffset.UTC).toLocalDate().plusDays(1)).content()){
                Instant instant=o.scheduledAt().toInstant();
                if(instant.isBefore(start) || !instant.isBefore(end))continue;
                String logical=ReminderIdentity.digest(schedule+"/"+instant);
                String reason=permitted(p,instant)?null:"OUTSIDE_PERMITTED_HOURS";
                UUID job=UUID.randomUUID();
                int changed=store.jdbc().update("""
                        insert into reminder_jobs(id,user_id,patient_link_id,link_generation,phone_binding,preferences_version,treatment_id,schedule_id,revision_id,occurrence_id,scheduled_at,logical_key,idempotency_key,channel,state,next_attempt_at,classification,mode,created_at,updated_at)
                        values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        on conflict(schedule_id,scheduled_at,user_id,preferences_version) do update set revision_id=excluded.revision_id,
                        occurrence_id=excluded.occurrence_id,state=excluded.state,classification=excluded.classification,updated_at=excluded.updated_at
                        where reminder_jobs.attempt_count=0 and reminder_jobs.state in ('SCHEDULED','SUPPRESSED','CANCELLED') and reminder_jobs.revision_id<>excluded.revision_id
                        """,job,user,id.linkId(),id.generation(),id.phoneBinding(),p.version(),treatmentId,schedule,o.revisionId(),o.id(),o.scheduledAt(),logical,job,p.channel(),reason==null?"SCHEDULED":"SUPPRESSED",o.scheduledAt(),reason,properties.getMode().name(),at(now),at(now));
                if(changed>0){inserted++;audit.record(null,"MEDICATION_REMINDER_PLANNED","MEDICATION_SCHEDULE",schedule);}
                if(inserted>=Math.min(budget,properties.getBatchSize()))break;
        }
        return inserted;
    }
}
