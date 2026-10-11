package id.tbcall.application.treatment;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.treatment.MedicationScheduleDtos.*;

/** A complete prescription per treatment; updates append snapshots rather than editing prescribed fields. */
@Service @Transactional(isolation=Isolation.READ_COMMITTED)
public class MedicationScheduleService {
    private final EntityManager em;
    private final TreatmentAccess access;
    private final ClinicalSourceAuthorityPolicy source;
    private final AuditService audit;
    private final Clock clock;
    public MedicationScheduleService(EntityManager em,TreatmentAccess access,ClinicalSourceAuthorityPolicy source,AuditService audit,Clock clock){
        this.em=em;this.access=access;this.source=source;this.audit=audit;this.clock=clock;
    }
    public Prescription create(CurrentActor actor,UUID treatmentId,Definition input){
        Treatment treatment=writable(actor,treatmentId);
        source.requireLocalCreate(actor,"TREATMENT_WRITE",treatment.getFacility().getId(),"MEDICATION_SCHEDULE");
        if(find(treatment)!=null)throw conflict("Pengobatan ini sudah memiliki jadwal. Gunakan revisi dengan versi terbaru.");
        var revision=definition(actor,treatment,input,1);
        var schedule=new MedicationSchedule();schedule.setId(UUID.randomUUID());schedule.setTreatment(treatment);schedule.setStatus("ACTIVE");
        schedule.setCreatedByUser(user(actor));schedule.setCreatedAt(now());schedule.setUpdatedAt(now());
        schedule.setCurrentRevisionId(revision.getId());revision.setSchedule(schedule);
        em.persist(schedule);em.persist(revision);em.flush();
        audit.record(actor.userId(),"MEDICATION_SCHEDULE_CREATED","MEDICATION_SCHEDULE",schedule.getId());return view(schedule);
    }
    public Prescription revise(CurrentActor actor,UUID treatmentId,Definition input,String match){
        Treatment treatment=writable(actor,treatmentId);MedicationSchedule schedule=required(treatment);IfMatch.require(match,schedule.getVersion());requireActive(schedule);
        MedicationScheduleRevision previous=current(schedule);editable(actor,treatment,schedule,previous);var revision=definition(actor,treatment,input,previous.getRevisionNumber()+1);
        if(revision.getValidFrom().isBefore(previous.getValidFrom()))throw conflict("Revisi tidak boleh mendahului aktivasi revisi terakhir.");
        previous.setStatus("SUPERSEDED");previous.setValidUntil(revision.getValidFrom());previous.setRetiredAt(now());previous.setRetiredByUser(user(actor));
        // Retire first to satisfy the partial unique index before inserting the successor.
        em.flush();revision.setSchedule(schedule);em.persist(revision);schedule.setCurrentRevisionId(revision.getId());schedule.setUpdatedAt(now());em.flush();
        audit.record(actor.userId(),"MEDICATION_SCHEDULE_REVISED","MEDICATION_SCHEDULE_REVISION",revision.getId());return view(schedule);
    }
    public Prescription cancel(CurrentActor actor,UUID treatmentId,String match){
        Treatment treatment=writable(actor,treatmentId);MedicationSchedule schedule=required(treatment);IfMatch.require(match,schedule.getVersion());requireActive(schedule);
        MedicationScheduleRevision revision=current(schedule);editable(actor,treatment,schedule,revision);
        schedule.setStatus("CANCELLED");schedule.setCancelledAt(now());schedule.setCancelledByUser(user(actor));schedule.setUpdatedAt(now());
        revision.setStatus("CANCELLED");revision.setRetiredAt(now());revision.setRetiredByUser(user(actor));em.flush();
        audit.record(actor.userId(),"MEDICATION_SCHEDULE_CANCELLED","MEDICATION_SCHEDULE",schedule.getId());return view(schedule);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Prescription staff(CurrentActor actor,UUID treatmentId){return view(find(access.staff(actor,"TREATMENT_READ",treatmentId,false)),treatmentId);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Prescription patient(CurrentActor actor){Treatment t=access.self(actor,"TREATMENT_READ",false);return view(find(t),t.getId());}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Prescription supporter(CurrentActor actor,UUID caseId){Treatment t=access.supporting(actor,"TREATMENT_READ",caseId,false);return view(find(t),t.getId());}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public RevisionPage history(CurrentActor actor,UUID treatmentId,int page,int size){
        Treatment treatment=access.staff(actor,"TREATMENT_READ",treatmentId,false);page(page,size);MedicationSchedule schedule=find(treatment);
        if(schedule==null)return new RevisionPage(List.of(),page,size,0);
        var revisions=em.createQuery("select r from MedicationScheduleRevision r where r.schedule.id=:id order by r.revisionNumber desc",MedicationScheduleRevision.class)
                .setParameter("id",schedule.getId()).setFirstResult(page*size).setMaxResults(size).getResultList();
        long total=em.createQuery("select count(r) from MedicationScheduleRevision r where r.schedule.id=:id",Long.class).setParameter("id",schedule.getId()).getSingleResult();
        return new RevisionPage(revisions.stream().map(this::revisionView).toList(),page,size,total);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public CalendarPage staffCalendar(CurrentActor actor,UUID treatmentId,LocalDate from,LocalDate to){return calendar(access.staff(actor,"TREATMENT_READ",treatmentId,false),from,to);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public CalendarPage patientCalendar(CurrentActor actor,LocalDate from,LocalDate to){return calendar(access.self(actor,"TREATMENT_READ",false),from,to);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public CalendarPage supporterCalendar(CurrentActor actor,UUID caseId,LocalDate from,LocalDate to){return calendar(access.supporting(actor,"TREATMENT_READ",caseId,false),from,to);}
    private CalendarPage calendar(Treatment treatment,LocalDate from,LocalDate to){
        range(from,to);MedicationSchedule schedule=find(treatment);if(schedule==null)return new CalendarPage(from,to,List.of(),List.of());
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
                if(date.isBefore(r.getStartDate()) || r.getEndDate()!=null && date.isAfter(r.getEndDate()) || (r.getWeekdayMask() & (1 << (date.getDayOfWeek().getValue()-1)))==0)continue;
                for(LocalTime time:r.getTimes().stream().sorted().toList()){
                    var local=LocalDateTime.of(date,time);var offsets=zone.getRules().getValidOffsets(local);
                    if(offsets.isEmpty()){
                        // A nonexistent wall time has no expected occurrence; never shift it to a guessed medication time.
                        // Associate a gap with its transition instant; do not report an already elapsed or cancelled gap.
                        Instant transition=zone.getRules().getTransition(local).getInstant();
                        if(!transition.isBefore(r.getValidFrom().toInstant()) && (r.getValidUntil()==null || transition.isBefore(r.getValidUntil().toInstant())) && (schedule.getCancelledAt()==null || transition.isBefore(schedule.getCancelledAt().toInstant())))
                            exceptions.add(new TemporalException(r.getId(),date,time.toString(),r.getTimeZone(),"LOCAL_TIME_GAP"));
                        continue;
                    }
                    OffsetDateTime scheduled=local.atOffset(offsets.getFirst());Instant instant=scheduled.toInstant();
                    if(instant.isBefore(r.getValidFrom().toInstant()) || r.getValidUntil()!=null && !instant.isBefore(r.getValidUntil().toInstant()) || schedule.getCancelledAt()!=null && !instant.isBefore(schedule.getCancelledAt().toInstant()))continue;
                    if(!instants.add(instant))throw conflict("Definisi jadwal menghasilkan waktu yang berulang.");
                    String id=r.getId()+"/"+date+"/"+time;
                    occurrences.add(new Occurrence("EXPECTED_OCCURRENCE",id,schedule.getId(),r.getId(),treatment.getId(),date,time.toString(),r.getTimeZone(),scheduled,offsets.size()>1?"EARLIER_OFFSET":"UNAMBIGUOUS"));
                }
            }
        }
        occurrences.sort(Comparator.comparing(v->v.scheduledAt().toInstant()));
        if(occurrences.size()>512 || exceptions.size()>512)throw conflict("Rentang kalender melebihi batas hasil.");
        return new CalendarPage(from,to,List.copyOf(occurrences),List.copyOf(exceptions));
    }
    private Treatment writable(CurrentActor actor,UUID treatmentId){
        Treatment treatment=access.staff(actor,"TREATMENT_WRITE",treatmentId,true);access.requireActive(treatment);
        if(!"ACTIVE".equals(treatment.getTbCase().getStatus()))throw TreatmentErrors.state();
        return treatment;
    }
    private void editable(CurrentActor actor,Treatment treatment,MedicationSchedule schedule,MedicationScheduleRevision revision){
        source.requireLocalEdit(actor,"TREATMENT_WRITE",treatment.getFacility().getId(),"MEDICATION_SCHEDULE",schedule.getId());
        source.requireLocalEdit(actor,"TREATMENT_WRITE",treatment.getFacility().getId(),"MEDICATION_SCHEDULE_REVISION",revision.getId());
    }
    private MedicationScheduleRevision definition(CurrentActor actor,Treatment treatment,Definition input,int number){
        if(input==null || input.timeZone()==null || !ZoneId.getAvailableZoneIds().contains(input.timeZone()))throw ApplicationFailure.invalid("Gunakan pengenal zona waktu IANA yang tersedia.");
        ZoneId zone=ZoneId.of(input.timeZone());LocalDate today=LocalDate.now(clock.withZone(zone));
        if(input.startDate()==null || input.startDate().isBefore(today) || input.startDate().isBefore(treatment.getStartDate()) || input.endDate()!=null && input.endDate().isBefore(input.startDate()))throw ApplicationFailure.invalid("Rentang jadwal tidak valid atau berlaku surut.");
        date(input.startDate());if(input.endDate()!=null)date(input.endDate());
        if(input.times()==null || input.times().isEmpty() || input.times().size()>8 || new HashSet<>(input.times()).size()!=input.times().size())throw ApplicationFailure.invalid("Pilih 1–8 waktu berbeda.");
        Set<LocalTime> times=new HashSet<>();for(String time:input.times()){
            if(time==null || !time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))throw ApplicationFailure.invalid("Waktu harus berformat HH:mm.");times.add(LocalTime.parse(time));
        }
        if(input.weekdays()==null || input.weekdays().isEmpty() || input.weekdays().size()>7 || new HashSet<>(input.weekdays()).size()!=input.weekdays().size() || input.weekdays().stream().anyMatch(d->d==null || d<1 || d>7))throw ApplicationFailure.invalid("Hari harus berbeda dan menggunakan ISO 1–7.");
        int mask=0;for(int day:input.weekdays())mask |= 1 << (day-1);
        var revision=new MedicationScheduleRevision();revision.setId(UUID.randomUUID());revision.setRevisionNumber(number);revision.setStatus("ACTIVE");revision.setTimeZone(input.timeZone());
        revision.setStartDate(input.startDate());revision.setEndDate(input.endDate());revision.setTimes(times);revision.setWeekdayMask(mask);revision.setCreatedAt(now());revision.setCreatedByUser(user(actor));
        Instant start=input.startDate().atStartOfDay(zone).toInstant();revision.setValidFrom(OffsetDateTime.ofInstant(start.isAfter(clock.instant())?start:clock.instant(),ZoneOffset.UTC));return revision;
    }
    private MedicationSchedule find(Treatment treatment){return em.createQuery("select s from MedicationSchedule s where s.treatment.id=:id",MedicationSchedule.class).setParameter("id",treatment.getId()).getResultList().stream().findFirst().orElse(null);}
    private MedicationSchedule required(Treatment treatment){var s=find(treatment);if(s==null)throw ApplicationFailure.missing();return s;}
    private MedicationScheduleRevision current(MedicationSchedule s){return em.find(MedicationScheduleRevision.class,s.getCurrentRevisionId());}
    private Prescription view(MedicationSchedule s){return view(s,s.getTreatment().getId());}
    private Prescription view(MedicationSchedule s,UUID treatmentId){return s==null?new Prescription("PRESCRIBED_SCHEDULE",null,treatmentId,null,"ABSENT",null,null):new Prescription("PRESCRIBED_SCHEDULE",s.getId(),treatmentId,s.getVersion(),s.getStatus(),revisionView(current(s)),s.getCancelledAt());}
    private Revision revisionView(MedicationScheduleRevision r){List<Integer> weekdays=new ArrayList<>();for(int d=1;d<=7;d++)if((r.getWeekdayMask() & (1 << (d-1)))!=0)weekdays.add(d);
        return new Revision(r.getId(),r.getRevisionNumber(),r.getStatus(),r.getTimeZone(),r.getStartDate(),r.getEndDate(),r.getWeekdayMask()==127?"DAILY":"SELECTED_WEEKDAYS",List.copyOf(weekdays),r.getTimes().stream().sorted().map(LocalTime::toString).toList(),r.getValidFrom(),r.getValidUntil(),r.getCreatedAt());}
    private User user(CurrentActor actor){return em.getReference(User.class,actor.userId());}
    private OffsetDateTime now(){return OffsetDateTime.now(clock);}
    private void requireActive(MedicationSchedule s){if(!"ACTIVE".equals(s.getStatus()))throw conflict("Jadwal dibatalkan dan tidak dapat direvisi.");}
    private static ApplicationFailure conflict(String detail){return new ApplicationFailure(409,"MEDICATION_SCHEDULE_CONFLICT","Konflik jadwal obat",detail);}
    private static void date(LocalDate d){if(d.getYear()<2000 || d.getYear()>2100)throw ApplicationFailure.invalid("Tanggal jadwal harus antara tahun 2000 dan 2100.");}
    private static void range(LocalDate from,LocalDate to){if(from==null || to==null)throw ApplicationFailure.invalid("Rentang tanggal diperlukan.");date(from);date(to);if(to.isBefore(from) || ChronoUnit.DAYS.between(from,to)>30)throw ApplicationFailure.invalid("Rentang kalender maksimum 31 hari inklusif.");}
    private static void page(int page,int size){if(page<0 || size<1 || size>100 || (long)page*size>Integer.MAX_VALUE)throw ApplicationFailure.invalid("Halaman harus tidak negatif dan ukuran antara 1 dan 100.");}
}
