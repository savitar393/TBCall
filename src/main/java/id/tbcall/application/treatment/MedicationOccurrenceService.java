package id.tbcall.application.treatment;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.treatment.MedicationScheduleDtos.*;

/** Shared prescribed-occurrence calculation; callers must authorize/validate their owner first. */
@Component @Transactional(propagation=Propagation.MANDATORY)
public class MedicationOccurrenceService {
    private final EntityManager em;private final Clock clock;
    public MedicationOccurrenceService(EntityManager em,Clock clock){this.em=em;this.clock=clock;}
    public CalendarPage calendar(Treatment treatment,LocalDate from,LocalDate to){
        range(from,to);Lifecycle lifecycle=lifecycle(treatment);Instant queriedAt=clock.instant();
        MedicationSchedule schedule=find(treatment);if(schedule==null)return new CalendarPage(from,to,List.of(),List.of(),lifecycle);
        // All ZoneOffsets are within 18 hours; exclude retired instant windows before enforcing the bounded candidate limit.
        OffsetDateTime earliest=from.atStartOfDay().atOffset(ZoneOffset.UTC).minusHours(18);
        OffsetDateTime latest=to.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC).plusHours(18);
        var revisions=em.createQuery("""
                select r from MedicationScheduleRevision r where r.schedule.id=:id and r.startDate<=:to
                and (r.endDate is null or r.endDate>=:from) and (r.validUntil is null or r.validUntil>r.validFrom)
                and r.validFrom<:latest and (r.validUntil is null or r.validUntil>:earliest)
                order by r.revisionNumber
                """,MedicationScheduleRevision.class).setParameter("id",schedule.getId()).setParameter("from",from).setParameter("to",to).setParameter("earliest",earliest).setParameter("latest",latest).setMaxResults(129).getResultList();
        if(revisions.size()>128)throw conflict("Rentang memuat terlalu banyak revisi. Persempit rentang kalender.");
        List<Occurrence> occurrences=new ArrayList<>();List<TemporalException> exceptions=new ArrayList<>();Set<Instant> instants=new HashSet<>();
        for(var r:revisions){
            ZoneId zone=ZoneId.of(r.getTimeZone());
            for(LocalDate date=from;!date.isAfter(to);date=date.plusDays(1)){
                if(lifecycle.actualEndDate()!=null && date.isAfter(lifecycle.actualEndDate()) || date.isBefore(r.getStartDate()) || r.getEndDate()!=null && date.isAfter(r.getEndDate()) || (r.getWeekdayMask() & (1 << (date.getDayOfWeek().getValue()-1)))==0)continue;
                for(LocalTime time:r.getTimes().stream().sorted().toList()){
                    var local=LocalDateTime.of(date,time);var offsets=zone.getRules().getValidOffsets(local);
                    if(offsets.isEmpty()){
                        // A nonexistent wall time has no expected occurrence; never shift it to a guessed medication time.
                        // Associate a gap with its transition instant; do not report an already elapsed or cancelled gap.
                        Instant transition=zone.getRules().getTransition(local).getInstant();
                        if((lifecycle.futureExpectationsAllowed() || transition.isBefore(queriedAt)) && !transition.isBefore(r.getValidFrom().toInstant()) && (r.getValidUntil()==null || transition.isBefore(r.getValidUntil().toInstant())) && (schedule.getCancelledAt()==null || transition.isBefore(schedule.getCancelledAt().toInstant())))
                            exceptions.add(new TemporalException(r.getId(),date,time.toString(),r.getTimeZone(),"LOCAL_TIME_GAP"));
                        continue;
                    }
                    OffsetDateTime scheduled=local.atOffset(offsets.getFirst());Instant instant=scheduled.toInstant();
                    // queriedAt suppresses current/future instructions; it is not a historical treatment termination timestamp.
                    if(!lifecycle.futureExpectationsAllowed() && !instant.isBefore(queriedAt) || instant.isBefore(r.getValidFrom().toInstant()) || r.getValidUntil()!=null && !instant.isBefore(r.getValidUntil().toInstant()) || schedule.getCancelledAt()!=null && !instant.isBefore(schedule.getCancelledAt().toInstant()))continue;
                    if(!instants.add(instant))throw conflict("Definisi jadwal menghasilkan waktu yang berulang.");
                    String id=r.getId()+"/"+date+"/"+time;
                    occurrences.add(new Occurrence("EXPECTED_OCCURRENCE",id,schedule.getId(),r.getId(),treatment.getId(),date,time.toString(),r.getTimeZone(),scheduled,offsets.size()>1?"EARLIER_OFFSET":"UNAMBIGUOUS"));
                }
            }
        }
        occurrences.sort(Comparator.comparing(v->v.scheduledAt().toInstant()));
        if(occurrences.size()>512 || exceptions.size()>512)throw conflict("Rentang kalender melebihi batas hasil.");
        return new CalendarPage(from,to,List.copyOf(occurrences),List.copyOf(exceptions),lifecycle);
    }

    private MedicationSchedule find(Treatment treatment){return em.createQuery("select s from MedicationSchedule s where s.treatment.id=:id",MedicationSchedule.class).setParameter("id",treatment.getId()).getResultList().stream().findFirst().orElse(null);}
    private Lifecycle lifecycle(Treatment t){return new Lifecycle(t.getStatus(),"ACTIVE".equals(t.getStatus()),t.getActualEndDate(),t.getActualEndDate()!=null);}
    private static ApplicationFailure conflict(String detail){return new ApplicationFailure(409,"MEDICATION_SCHEDULE_CONFLICT","Konflik jadwal obat",detail);}
    private static void date(LocalDate d){if(d.getYear()<2000 || d.getYear()>2100)throw ApplicationFailure.invalid("Tanggal jadwal harus antara tahun 2000 dan 2100.");}
    private static void range(LocalDate from,LocalDate to){if(from==null || to==null)throw ApplicationFailure.invalid("Rentang tanggal diperlukan.");date(from);date(to);if(to.isBefore(from) || ChronoUnit.DAYS.between(from,to)>30)throw ApplicationFailure.invalid("Rentang kalender maksimum 31 hari inklusif.");}
}
