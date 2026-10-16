package id.tbcall.application.reminder;

import id.tbcall.application.common.AuditService;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.reminder.ReminderStore.*;

/** Durable admission is the send boundary. Transport I/O never runs in these transactions. */
@Service
@Transactional(propagation=Propagation.REQUIRES_NEW,isolation=Isolation.READ_COMMITTED)
public class ReminderDispatchWorker {
    public record Claim(UUID jobId,UUID lease) {}
    public record Handoff(ReminderTransport.Message message,UUID lease,int attemptNumber) {}
    private static final String TEXT="Pengingat jadwal Anda. Silakan buka aplikasi untuk melihat informasi. Kelola pengingat melalui pengaturan akun.";
    private final ReminderStore store;
    private final ReminderEligibility eligibility;
    private final ReminderProperties properties;
    private final ReminderTransports transports;
    private final Clock clock;
    private final AuditService audit;
    private final MetaWhatsAppProperties meta;
    private final ReminderProviderState provider;
    private final ReminderDestinations destinations;private final ChannelProviderProperties channels;

    public ReminderDispatchWorker(ReminderStore store,ReminderEligibility eligibility,ReminderProperties properties,
            ReminderTransports transports,Clock clock,AuditService audit,MetaWhatsAppProperties meta,ReminderProviderState provider,ReminderDestinations destinations,ChannelProviderProperties channels){
        this.store=store;this.eligibility=eligibility;this.properties=properties;this.transports=transports;this.clock=clock;this.audit=audit;
        this.meta=meta;this.provider=provider;this.destinations=destinations;this.channels=channels;
    }

    public List<Claim> claim(){
        Instant now=clock.instant();
        var jobs=store.jdbc().queryForList("""
                select id from reminder_jobs where state='SCHEDULED' and next_attempt_at<=? and scheduled_at<=?
                order by next_attempt_at,id limit ? for update skip locked
                """,UUID.class,at(now),at(now),properties.getBatchSize());
        var result=new ArrayList<Claim>();
        for(UUID job:jobs){
            UUID lease=UUID.randomUUID();
            store.jdbc().update("update reminder_jobs set state='ELIGIBLE',lease_token=?,lease_until=?,updated_at=? where id=?",
                    lease,at(now.plusSeconds(properties.getClaimSeconds())),at(now),job);
            result.add(new Claim(job,lease));
        }
        return List.copyOf(result);
    }

    public Claim claimOne(UUID id){
        Instant now=clock.instant();
        var jobs=store.jdbc().queryForList("select id from reminder_jobs where id=? and state='SCHEDULED' and next_attempt_at<=? and scheduled_at<=? for update skip locked",
                UUID.class,id,at(now),at(now));
        if(jobs.isEmpty())return null;
        UUID lease=UUID.randomUUID();
        store.jdbc().update("update reminder_jobs set state='ELIGIBLE',lease_token=?,lease_until=?,updated_at=? where id=?",
                lease,at(now.plusSeconds(properties.getClaimSeconds())),at(now),id);
        return new Claim(id,lease);
    }

    public Handoff admit(Claim claim){
        Job source=store.job(claim.jobId(),false);
        if(source==null)return null;
        // Clinical/account locks precede preferences/job locks, matching consent and clinical writers.
        var identity=eligibility.lock(source.treatmentId(),source.userId(),source.scheduleId());
        Preference preference=store.preference(source.userId(),true);
        Job job=store.job(source.id(),true);
        Instant now=clock.instant();
        if(job==null || !"ELIGIBLE".equals(job.state()) || !claim.lease().equals(job.lease())
                || !job.leaseUntil().toInstant().isAfter(now))return null;
        String reason=eligibility.check(job,preference,identity,now);
        if(reason==null && !transports.available(job.channel()))reason="PROVIDER_DISABLED";
        if(reason==null && properties.getMode()==ReminderProperties.Mode.CLOUD_TEST && !meta.allows(identity.phone()))reason="TEST_RECIPIENT_NOT_ALLOWED";
        var destination=destinations.current(identity,job.channel(),false);
        if(reason==null && properties.getMode()==ReminderProperties.Mode.CHANNEL_TEST &&
                !("EMAIL".equals(job.channel()) && channels.emailAllowed(destination.value()) || "TELEGRAM".equals(job.channel()) && channels.telegramAllowed(destination.value())))reason="TEST_RECIPIENT_NOT_ALLOWED";
        if(reason!=null){terminal(job,"SUPPRESSED",reason,now);return null;}
        boolean duplicate=store.jdbc().queryForObject("""
                select exists(select 1 from reminder_jobs where logical_key=? and channel=? and id<>?
                and state in ('DISPATCHED','ACCEPTED','DELIVERED','UNCERTAIN'))
                """,Boolean.class,job.logicalKey(),job.channel(),job.id());
        if(duplicate || "WHATSAPP".equals(job.channel()) && provider.previouslyAccepted(job.logicalKey())){terminal(job,"CANCELLED","DUPLICATE_HANDOFF",now);return null;}
        int logicalAttempts=store.jdbc().queryForObject("select coalesce(sum(attempt_count),0) from reminder_jobs where logical_key=? and channel=?",Integer.class,job.logicalKey(),job.channel());
        if(logicalAttempts>=properties.getMaxAttempts()){terminal(job,"FAILED","ATTEMPT_LIMIT",now);return null;}
        int attempt=job.attempts()+1;
        store.jdbc().update("""
                update reminder_jobs set state='DISPATCHED',attempt_count=?,lease_until=?,classification='HANDOFF_ADMITTED',
                mode=?,updated_at=? where id=?
                """,attempt,at(now.plusSeconds(properties.getClaimSeconds())),properties.getMode().name(),at(now),job.id());
        UUID attemptId=UUID.randomUUID();
        store.jdbc().update("""
                insert into reminder_attempts(id,job_id,attempt_number,lease_token,channel,outcome,mode,started_at)
                values (?,?,?,?,?,'PENDING',?,?)
                """,attemptId,job.id(),attempt,claim.lease(),job.channel(),properties.getMode().name(),at(now));
        UUID callback=properties.getMode()==ReminderProperties.Mode.CLOUD_TEST?UUID.randomUUID():null;
        if(callback!=null)provider.register(attemptId,callback,identity.phone(),now);
        audit.record(null,"MEDICATION_REMINDER_HANDOFF_ADMITTED","REMINDER_JOB",job.id());
        return new Handoff(new ReminderTransport.Message(job.id(),job.idempotency()+":"+job.channel(),job.channel(),destination.value(),TEXT,callback),claim.lease(),attempt);
    }

    public void complete(Handoff handoff,ReminderTransport.Result result){
        Job job=store.job(handoff.message().jobId(),true);
        if(job==null || !"DISPATCHED".equals(job.state()) || !handoff.lease().equals(job.lease())
                || handoff.attemptNumber()!=job.attempts())return;
        Instant now=clock.instant();
        var outcome=result==null || result.outcome()==null?ReminderTransport.Outcome.UNCERTAIN:result.outcome();
        String correlation=result==null?null:result.correlation();
        if(correlation!=null && !correlation.matches("[A-Za-z0-9._:-]{1,120}")){
            // Never retain arbitrary provider text or interpret an invalid response as safe to retry.
            correlation=null;outcome=ReminderTransport.Outcome.UNCERTAIN;
        }
        if(outcome==ReminderTransport.Outcome.ACCEPTED && "CLOUD_TEST".equals(job.mode())
                && !provider.accepted(handoff.message().callbackToken(),correlation,now)){
            correlation=null;outcome=ReminderTransport.Outcome.UNCERTAIN;
        }
        String state="FAILED",classification=outcome.name();
        Instant next=now;
        switch(outcome){
            case ACCEPTED -> {state="ACCEPTED";classification="SIMULATED".equals(job.mode())?"SIMULATED_ACCEPTANCE":"PROVIDER_ACCEPTANCE";}
            case UNCERTAIN -> state="UNCERTAIN";
            case FAILED -> { /* A definitive terminal result does not authorize another handoff. */ }
            case SAFE_RETRY -> {
                Preference p=store.preference(job.userId(),false);
                boolean current=p!=null && p.enrollmentVersion(job.channel())==job.preferenceVersion();
                // No nested identity locks here: authoritative full revalidation occurs on the next admission.
                boolean timely=!now.isAfter(job.scheduledAt().toInstant().plusSeconds(properties.getMaxLatenessMinutes()*60L));
                if(current && consent(p,job.channel()) && timely && job.attempts()<properties.getMaxAttempts()){
                    next=now.plusSeconds(properties.getRetrySeconds()*(1L<<(job.attempts()-1)));
                    if(!next.isAfter(job.scheduledAt().toInstant().plusSeconds(properties.getMaxLatenessMinutes()*60L))){
                        state="SCHEDULED";
                    }else classification="EXPIRED";
                }
            }
        }
        store.jdbc().update("""
                update reminder_attempts set outcome=?,finished_at=?,provider_correlation=?
                where job_id=? and attempt_number=? and lease_token=? and outcome='PENDING'
                """,outcome.name(),at(now),correlation,job.id(),job.attempts(),handoff.lease());
        store.jdbc().update("""
                update reminder_jobs set state=?,classification=?,provider_correlation=?,next_attempt_at=?,
                lease_token=null,lease_until=null,updated_at=? where id=?
                """,state,classification,correlation,at(next),at(now),job.id());
        audit.record(null,"MEDICATION_REMINDER_"+state,"REMINDER_JOB",job.id());
    }

    public int recover(){
        Instant now=clock.instant();
        var jobs=store.jdbc().queryForList("""
                select id from reminder_jobs where state in ('ELIGIBLE','DISPATCHED') and lease_until<=?
                order by lease_until,id limit ? for update skip locked
                """,UUID.class,at(now),properties.getBatchSize());
        for(UUID id:jobs){
            Job job=store.job(id,false);
            if("DISPATCHED".equals(job.state())){
                store.jdbc().update("update reminder_attempts set outcome='UNCERTAIN',finished_at=? where job_id=? and outcome='PENDING'",at(now),id);
                terminal(job,"UNCERTAIN","HANDOFF_UNCERTAIN",now);
            }else terminal(job,"SCHEDULED","CLAIM_EXPIRED_BEFORE_HANDOFF",now);
        }
        return jobs.size();
    }

    private void terminal(Job job,String state,String classification,Instant now){
        store.jdbc().update("update reminder_jobs set state=?,classification=?,lease_token=null,lease_until=null,updated_at=? where id=?",state,classification,at(now),job.id());
        audit.record(null,"MEDICATION_REMINDER_"+state,"REMINDER_JOB",job.id());
    }
}
