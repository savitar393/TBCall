package id.tbcall.application.vot;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.application.common.*;
import id.tbcall.application.treatment.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.io.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.*;
import static id.tbcall.application.vot.VotDtos.*;

@Service @Transactional(isolation=Isolation.READ_COMMITTED)
public class VotService {
    public static final String CONSENT_POLICY="vot-synthetic-v1";
    private final EntityManager em;
    private final TreatmentAccess treatments;
    private final ClinicalAccess clinical;
    private final MedicationOccurrenceService occurrences;
    private final VotStorage storage;
    private final VotProperties properties;
    private final AuditService audit;
    private final Clock clock;
    public VotService(EntityManager em,TreatmentAccess treatments,ClinicalAccess clinical,MedicationOccurrenceService occurrences,
            VotStorage storage,VotProperties properties,AuditService audit,Clock clock){
        this.em=em;this.treatments=treatments;this.clinical=clinical;this.occurrences=occurrences;this.storage=storage;this.properties=properties;this.audit=audit;this.clock=clock;
    }
    public Policy policy(CurrentActor actor){self(actor,"VOT_SELF_READ",false);return new Policy(properties.isEnabled(),true,properties.getMaxFileBytes(),properties.getRetentionDays(),CONSENT_POLICY);}

    /** One atomic upload/create command: no public draft IDs or replaceable media. */
    public Submission submit(CurrentActor actor,UUID treatmentId,String occurrenceId,boolean consent,String policy,InputStream input,String contentType,long length){
        enabled();PatientUserLink link=self(actor,"VOT_SELF_WRITE",true);
        if(!consent || !CONSENT_POLICY.equals(policy))throw ApplicationFailure.invalid("Persetujuan video dan versi kebijakan yang berlaku diperlukan.");
        if(occurrenceId==null || occurrenceId.length()>100)throw ApplicationFailure.invalid("Identitas waktu terjadwal tidak valid.");
        String[] parts=occurrenceId.split("/",-1);LocalDate date;UUID revisionId;
        try{if(parts.length!=3)throw new IllegalArgumentException();revisionId=UUID.fromString(parts[0]);date=LocalDate.parse(parts[1]);LocalTime.parse(parts[2]);}
        catch(RuntimeException bad){throw ApplicationFailure.invalid("Identitas waktu terjadwal tidak valid.");}
        Treatment treatment=ownedTreatment(actor,treatmentId,true);
        if(!"ACTIVE".equals(treatment.getStatus()) || !"ACTIVE".equals(treatment.getTbCase().getStatus()))throw conflict("Pengobatan atau kasus sudah tidak aktif.");
        var schedules=em.createQuery("select s from MedicationSchedule s where s.treatment.id=:t",MedicationSchedule.class).setParameter("t",treatmentId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        if(schedules.isEmpty())throw conflict("Jadwal pengobatan belum tersedia.");
        MedicationSchedule schedule=schedules.getFirst();MedicationScheduleRevision revision=em.find(MedicationScheduleRevision.class,revisionId);
        if(!"ACTIVE".equals(schedule.getStatus()) || !schedule.getCurrentRevisionId().equals(revisionId) || revision==null || !"ACTIVE".equals(revision.getStatus()) || !revision.getSchedule().getId().equals(schedule.getId()))throw conflict("Jadwal dibatalkan atau revisi sudah berubah. Muat ulang jadwal.");
        if(revision.getEndDate()!=null && LocalDate.now(clock.withZone(ZoneId.of(revision.getTimeZone()))).isAfter(revision.getEndDate()))throw conflict("Masa berlaku jadwal telah berakhir. Hubungi petugas untuk memeriksa jadwal.");
        var occurrence=occurrences.calendar(treatment,date,date).content().stream().filter(o->o.id().equals(occurrenceId)).findFirst().orElseThrow(()->conflict("Waktu tersebut bukan kejadian obat yang diresepkan."));
        Instant scheduled=occurrence.scheduledAt().toInstant();
        if(scheduled.isAfter(clock.instant()) || scheduled.isBefore(clock.instant().minus(Duration.ofDays(7))))throw conflict("Video hanya dapat dikirim untuk waktu terjadwal yang sudah tiba dalam tujuh hari terakhir.");
        if(em.createQuery("select count(v) from VotSubmission v where v.scheduleId=:s and v.scheduledAt=:at",Long.class).setParameter("s",schedule.getId()).setParameter("at",occurrence.scheduledAt()).getSingleResult()>0)throw conflict("Video untuk waktu ini sudah pernah dikirim. Kiriman asli tidak dapat diganti.");
        VotStorage.StoredMedia media;
        try{media=storage.store(input,contentType,length);}
        catch(VotStorage.UploadRejected rejected){throw new ApplicationFailure(rejected.getStatus(),"VOT_UPLOAD_REJECTED","Video tidak diterima",rejected.getMessage());}
        catch(IOException unavailable){throw unavailable();}
        // Database rollback must not leave a newly stored private file behind. Crash leftovers are swept by retention.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED)try{storage.delete(media.key());}catch(IOException ignored){/* bounded orphan sweep retries */}}
        });
        self(actor,"VOT_SELF_WRITE",false);
        OffsetDateTime now=now();var v=new VotSubmission();v.setId(UUID.randomUUID());v.setPatientId(link.getPatient().getId());v.setTreatment(treatment);
        v.setScheduleId(schedule.getId());v.setRevisionId(revisionId);v.setOccurrenceId(occurrence.id());v.setLocalDate(occurrence.localDate());v.setLocalTime(LocalTime.parse(occurrence.localTime()));v.setTimeZone(occurrence.timeZone());v.setScheduledAt(occurrence.scheduledAt());
        v.setUploadedByUserId(actor.userId());v.setPatientLinkId(link.getId());v.setMediaKey(media.key());v.setContentType(media.contentType());v.setMediaSize(media.size());v.setSubmittedAt(now);v.setStatus("PENDING_REVIEW");v.setConsentAcknowledged(true);v.setConsentPolicyVersion(CONSENT_POLICY);v.setRetentionExpiresAt(now.plusDays(properties.getRetentionDays()));v.setCreatedAt(now);v.setUpdatedAt(now);
        em.persist(v);em.flush();audit.record(actor.userId(),"VOT_SUBMISSION_CREATED","VOT_SUBMISSION",v.getId());audit.record(actor.userId(),"VOT_VIDEO_STORED","VOT_SUBMISSION",v.getId());return view(v);
    }
    @Transactional(readOnly=true)
    public Page patientList(CurrentActor actor,int page,int size){enabled();UUID patient=self(actor,"VOT_SELF_READ",false).getPatient().getId();return list("v.patientId=:patient",Map.of("patient",patient),page,size);}
    @Transactional(readOnly=true)
    public Submission patientDetail(CurrentActor actor,UUID id){enabled();return view(patientSubmission(actor,id,"VOT_SELF_READ",false));}
    public Submission cancel(CurrentActor actor,UUID id,String match){
        enabled();VotSubmission v=patientSubmission(actor,id,"VOT_SELF_WRITE",true);IfMatch.require(match,v.getVersion());pending(v);
        v.setStatus("CANCELLED");v.setCancelledAt(now());v.setCancelledByUserId(actor.userId());v.setUpdatedAt(now());em.flush();audit.record(actor.userId(),"VOT_SUBMISSION_CANCELLED","VOT_SUBMISSION",id);return view(v);
    }
    @Transactional(readOnly=true)
    public Page staffList(CurrentActor actor,UUID treatmentId,String status,int page,int size){
        enabled();clinical.officer(actor,"VOT_REVIEW_READ");
        Map<String,Object> parameters=new HashMap<>();parameters.put("facilities",actor.facilityIds());
        String predicate="v.treatment.facility.id in :facilities and v.treatment.facility.active=true and v.treatment.tbCase.currentFacility.id in :facilities and v.treatment.tbCase.currentFacility.active=true";
        if(treatmentId!=null){treatments.staff(actor,"VOT_REVIEW_READ",treatmentId,false);predicate+=" and v.treatment.id=:treatment";parameters.put("treatment",treatmentId);}
        if(status!=null){if(!Set.of("PENDING_REVIEW","OBSERVED","NOT_VERIFIABLE","CANCELLED").contains(status))throw ApplicationFailure.invalid("Status VOT tidak valid.");predicate+=" and v.status=:status";parameters.put("status",status);}
        return list(predicate,parameters,page,size);
    }
    @Transactional(readOnly=true)
    public Submission staffDetail(CurrentActor actor,UUID id){enabled();return view(staffSubmission(actor,id,"VOT_REVIEW_READ",false));}
    public Submission review(CurrentActor actor,UUID id,Review input,String match){
        enabled();VotSubmission v=staffSubmission(actor,id,"VOT_REVIEW_WRITE",true);IfMatch.require(match,v.getVersion());pending(v);retained(v);
        if(input==null || !Set.of("OBSERVED","NOT_VERIFIABLE").contains(input.decision()) || input.notes()!=null && input.notes().length()>2000)throw ApplicationFailure.invalid("Pilih klasifikasi peninjauan yang tersedia; catatan maksimum 2000 karakter.");
        v.setStatus(input.decision());v.setReviewedAt(now());v.setReviewedByUserId(actor.userId());v.setReviewNotes(input.notes()==null?null:input.notes().strip());v.setUpdatedAt(now());em.flush();
        audit.record(actor.userId(),"VOT_REVIEW_COMPLETED","VOT_SUBMISSION",id);return view(v);
    }
    public record Media(InputStream stream,String contentType,long size) implements AutoCloseable {public void close()throws IOException{stream.close();}}
    @Transactional(readOnly=true)
    public Media media(CurrentActor actor,UUID id,boolean patient){
        enabled();var v=patient?patientSubmission(actor,id,"VOT_SELF_READ",false):staffSubmission(actor,id,"VOT_REVIEW_READ",false);retained(v);
        if(!patient && "CANCELLED".equals(v.getStatus()))throw new ApplicationFailure(410,"VOT_CONSENT_WITHDRAWN","Video dibatalkan","Pasien membatalkan peninjauan video ini. Pemutaran oleh petugas tidak lagi tersedia.");
        try{return new Media(storage.open(v.getMediaKey()),v.getContentType(),v.getMediaSize());}
        catch(FileNotFoundException | java.nio.file.NoSuchFileException gone){throw expired();}
        catch(IOException unavailable){throw unavailable();}
    }
    private VotSubmission patientSubmission(CurrentActor actor,UUID id,String permission,boolean lock){
        UUID patient=self(actor,permission,lock).getPatient().getId();
        var ids=em.createQuery("select v.id from VotSubmission v where v.id=:id and v.patientId=:p",UUID.class).setParameter("id",id).setParameter("p",patient).getResultList();
        if(ids.isEmpty())throw missing(actor);return lock?em.find(VotSubmission.class,id,LockModeType.PESSIMISTIC_WRITE):em.find(VotSubmission.class,id);
    }
    private VotSubmission staffSubmission(CurrentActor actor,UUID id,String permission,boolean lock){
        clinical.officer(actor,permission);var owners=em.createQuery("select v.treatment.id from VotSubmission v where v.id=:id",UUID.class).setParameter("id",id).getResultList();
        if(owners.isEmpty())throw missing(actor);
        try{treatments.staff(actor,permission,owners.getFirst(),lock);}catch(ApplicationFailure failure){audit.authorizationDenied(actor.userId());throw failure;}
        return lock?em.find(VotSubmission.class,id,LockModeType.PESSIMISTIC_WRITE):em.find(VotSubmission.class,id);
    }
    private Treatment ownedTreatment(CurrentActor actor,UUID id,boolean lock){
        var cases=em.createQuery("select t.tbCase.id from Treatment t where t.id=:id and t.tbCase.registration.patient.id=:p",UUID.class).setParameter("id",id).setParameter("p",actor.selfPatientId()).getResultList();
        if(cases.isEmpty())throw missing(actor);if(lock)em.find(TBCase.class,cases.getFirst(),LockModeType.PESSIMISTIC_WRITE);
        return lock?em.find(Treatment.class,id,LockModeType.PESSIMISTIC_WRITE):em.find(Treatment.class,id);
    }
    private PatientUserLink self(CurrentActor actor,String permission,boolean lock){
        if(!actor.hasRole("PATIENT") || !actor.permissions().contains(permission) || actor.selfPatientId()==null){audit.authorizationDenied(actor.userId());throw ApplicationFailure.forbidden();}
        var query=em.createQuery("select l from PatientUserLink l where l.user.id=:u and l.patient.id=:p and l.relationshipType='SELF' and l.verificationStatus='VERIFIED' and l.verifiedAt is not null and l.user.status='ACTIVE' and (l.user.emailVerifiedAt is not null or l.user.phoneVerifiedAt is not null)",PatientUserLink.class).setParameter("u",actor.userId()).setParameter("p",actor.selfPatientId());
        if(lock)query.setLockMode(LockModeType.PESSIMISTIC_READ);var links=query.getResultList();if(links.size()!=1){audit.authorizationDenied(actor.userId());throw ApplicationFailure.forbidden();}return links.getFirst();
    }
    private Page list(String predicate,Map<String,Object> parameters,int page,int size){
        if(page<0 || size<1 || size>100 || (long)page*size>Integer.MAX_VALUE)throw ApplicationFailure.invalid("Ukuran halaman harus 1–100 dan halaman tidak negatif.");
        var query=em.createQuery("select v from VotSubmission v where "+predicate+" order by v.submittedAt desc,v.id desc",VotSubmission.class);
        var count=em.createQuery("select count(v) from VotSubmission v where "+predicate,Long.class);parameters.forEach((key,value)->{query.setParameter(key,value);count.setParameter(key,value);});
        return new Page(query.setFirstResult(page*size).setMaxResults(size).getResultList().stream().map(this::view).toList(),page,size,count.getSingleResult());
    }
    private Submission view(VotSubmission v){return new Submission(v.getId(),v.getPatientId(),v.getTreatment().getId(),v.getScheduleId(),v.getRevisionId(),v.getOccurrenceId(),v.getScheduledAt(),v.getLocalDate(),v.getLocalTime().toString(),v.getTimeZone(),v.getContentType(),v.getMediaSize(),v.getSubmittedAt(),v.getStatus(),v.isConsentAcknowledged(),v.getConsentPolicyVersion(),v.getReviewedAt(),v.getReviewedByUserId(),v.getReviewNotes(),v.getVersion(),v.getRetentionExpiresAt(),v.getMediaDeletedAt());}
    private void enabled(){if(!properties.isEnabled())throw ApplicationFailure.missing();}
    private void pending(VotSubmission v){if(!"PENDING_REVIEW".equals(v.getStatus()))throw conflict("Kiriman telah ditinjau atau dibatalkan. Keputusan asli tetap tersimpan.");}
    private void retained(VotSubmission v){if(v.getMediaDeletedAt()!=null || !now().isBefore(v.getRetentionExpiresAt()))throw expired();}
    private OffsetDateTime now(){return OffsetDateTime.now(clock);}
    private ApplicationFailure missing(CurrentActor actor){audit.authorizationDenied(actor.userId());return ApplicationFailure.missing();}
    private static ApplicationFailure conflict(String detail){return new ApplicationFailure(409,"VOT_CONFLICT","Konflik kiriman video",detail);}
    private static ApplicationFailure expired(){return new ApplicationFailure(410,"VOT_MEDIA_EXPIRED","Video tidak tersedia","Masa penyimpanan video telah berakhir atau media telah dihapus.");}
    private static ApplicationFailure unavailable(){return new ApplicationFailure(503,"VOT_STORAGE_UNAVAILABLE","Penyimpanan tidak tersedia","Video tidak dapat diproses saat ini. Coba lagi atau hubungi petugas.");}
}
