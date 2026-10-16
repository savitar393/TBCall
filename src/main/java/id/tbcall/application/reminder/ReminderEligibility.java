package id.tbcall.application.reminder;

import id.tbcall.application.treatment.MedicationOccurrenceService;
import id.tbcall.persistence.entity.Treatment;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.util.UUID;
import org.springframework.stereotype.Component;
import static id.tbcall.application.reminder.ReminderStore.*;

@Component
public class ReminderEligibility {
    private final ReminderStore store;private final ReminderIdentity identities;private final EntityManager em;
    private final MedicationOccurrenceService occurrences;private final ReminderProperties properties;
    private final ReminderDestinations destinations;
    public ReminderEligibility(ReminderStore store,ReminderIdentity identities,EntityManager em,MedicationOccurrenceService occurrences,ReminderProperties properties,ReminderDestinations destinations){this.store=store;this.identities=identities;this.em=em;this.occurrences=occurrences;this.properties=properties;this.destinations=destinations;}
    /** Consistent with clinical case/treatment locks and account-link patient/user order. Job locks come last. */
    public ReminderIdentity.Identity lock(UUID treatment,UUID user,UUID schedule){
        var cases=store.jdbc().queryForList("select case_id from treatments where id=?",UUID.class,treatment);
        if(cases.isEmpty())return null;
        store.jdbc().queryForList("select id from tb_cases where id=? for update",cases.getFirst());
        store.jdbc().queryForList("select id from treatments where id=? for update",treatment);
        var id=identities.forUser(user,true);
        store.jdbc().queryForList("select id from medication_schedules where id=? for update",schedule);
        return id;
    }
    public String check(Job job,Preference p,ReminderIdentity.Identity id,Instant now){
        if(id==null || !id.linkId().equals(job.linkId()) || !id.generation().equals(job.generation()))return "LINK_CHANGED";
        if(!id.active())return "ACCOUNT_RESTRICTED";
        if(!id.patientRole())return "NO_PATIENT_ROLE";
        var destination=destinations.current(id,job.channel(),false);
        if(destination==null || !java.util.Objects.equals(destination.binding(),job.destinationBinding()))return switch(job.channel()){case "WHATSAPP"->"PHONE_CHANGED";case "EMAIL"->"EMAIL_CHANGED";default->"TELEGRAM_CHANGED";};
        if(!destinations.bound(p,id,job.channel()) || p.enrollmentVersion(job.channel())!=job.preferenceVersion() || !consent(p,job.channel()))return "CONSENT_CHANGED";
        Treatment treatment=em.find(Treatment.class,job.treatmentId());
        if(treatment==null || !"ACTIVE".equals(treatment.getStatus()))return "TREATMENT_INACTIVE";
        if(!"ACTIVE".equals(treatment.getTbCase().getStatus()))return "CASE_INACTIVE";
        if(!treatment.getTbCase().getRegistration().getPatient().getId().equals(id.patientId()))return "LINK_CHANGED";
        long active=store.jdbc().queryForObject("select count(*) from treatments t join tb_cases c on c.id=t.case_id join tb_registrations r on r.id=c.registration_id where r.patient_id=? and t.status='ACTIVE'",Long.class,id.patientId());
        if(active!=1)return "AMBIGUOUS_TREATMENT";
        var schedules=store.jdbc().queryForList("select status from medication_schedules where id=? and treatment_id=?",String.class,job.scheduleId(),job.treatmentId());
        if(schedules.size()!=1 || !"ACTIVE".equals(schedules.getFirst()))return "SCHEDULE_CANCELLED";
        var zones=store.jdbc().queryForList("select time_zone from medication_schedule_revisions where id=? and schedule_id=?",String.class,job.revisionId(),job.scheduleId());
        if(zones.size()!=1)return "REVISION_OBSOLETE";
        Instant expected=job.scheduledAt().toInstant();LocalDate date=expected.atZone(ZoneId.of(zones.getFirst())).toLocalDate();
        boolean valid=occurrences.calendar(treatment,date,date).content().stream().anyMatch(o->o.revisionId().equals(job.revisionId()) && o.scheduleId().equals(job.scheduleId()) && o.scheduledAt().toInstant().equals(expected));
        if(!valid)return "REVISION_OBSOLETE";
        if(now.isBefore(expected))return "NOT_DUE";
        if(now.isAfter(expected.plusSeconds(properties.getMaxLatenessMinutes()*60L)))return "EXPIRED";
        if(!permitted(p,expected) || !permitted(p,now))return "OUTSIDE_PERMITTED_HOURS";
        return null;
    }
}
