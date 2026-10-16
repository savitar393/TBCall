package id.tbcall.application.reminder;

import id.tbcall.application.common.AuditService;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.reminder.ReminderStore.*;
import static id.tbcall.application.reminder.ReminderCallbackVerifier.*;

/** One bounded event per transaction; no transport calls or clinical writes. */
@Service
public class ReminderProviderEventWorker {
    private final ReminderStore store;
    private final ReminderIdentity identities;
    private final MetaWhatsAppProperties meta;
    private final AuditService audit;
    public ReminderProviderEventWorker(ReminderStore store,ReminderIdentity identities,MetaWhatsAppProperties meta,AuditService audit){
        this.store=store;this.identities=identities;this.meta=meta;this.audit=audit;
    }
    @Transactional(propagation=Propagation.REQUIRES_NEW,isolation=Isolation.READ_COMMITTED)
    public boolean apply(VerifiedEvent event,Instant received){
        int inserted=store.jdbc().update("""
                insert into reminder_provider_events(event_key,kind,occurred_at,received_at,result)
                values (?,?,?,?,'PENDING') on conflict(event_key) do nothing
                """,event.providerEventId(),event.kind().name(),at(event.occurredAt()),at(received));
        if(inserted==0)return false;
        String result=event.kind()==Kind.OPT_OUT?optOut(event,received):status(event,received);
        store.jdbc().update("update reminder_provider_events set result=? where event_key=?",result,event.providerEventId());
        return "APPLIED".equals(result);
    }
    private record Target(UUID attempt,UUID job,String recipient,String message,Instant created,boolean delivered,boolean failed){}
    private String status(VerifiedEvent event,Instant received){
        String condition=event.callbackToken()!=null?"h.callback_token=?":"h.message_digest=?";
        Object key=event.callbackToken()!=null?event.callbackToken():event.messageDigest();
        var jobs=store.jdbc().queryForList("""
                select a.job_id from reminder_provider_handoffs h join reminder_attempts a on a.id=h.attempt_id
                where h.business_account_id=? and h.phone_number_id=? and
                """+condition,UUID.class,meta.getBusinessAccountId(),meta.getTestPhoneNumberId(),key);
        if(jobs.size()!=1)return "IGNORED";
        Job job=store.job(jobs.getFirst(),true);
        if(job==null || !"CLOUD_TEST".equals(job.mode()))return "IGNORED";
        // Same ordering as completion: lock the job before its provider handoff.
        var targets=store.jdbc().query("""
                select h.*,a.job_id from reminder_provider_handoffs h join reminder_attempts a on a.id=h.attempt_id
                where a.job_id=? and h.business_account_id=? and h.phone_number_id=? and
                """+condition+" for update of h",(r,n)->new Target(r.getObject("attempt_id",UUID.class),r.getObject("job_id",UUID.class),
                r.getString("recipient_digest"),r.getString("message_digest"),r.getObject("created_at",OffsetDateTime.class).toInstant(),
                r.getObject("delivered_at")!=null,r.getObject("failed_at")!=null),job.id(),meta.getBusinessAccountId(),meta.getTestPhoneNumberId(),key);
        if(targets.size()!=1)return "IGNORED";
        var target=targets.getFirst();
        if(!target.recipient().equals(event.recipientDigest()) || target.message()!=null && !target.message().equals(event.messageDigest()))return "IGNORED";
        if(event.occurredAt().isBefore(target.created().truncatedTo(ChronoUnit.SECONDS)))return "STALE";
        store.jdbc().update("""
                update reminder_provider_handoffs set message_digest=?,accepted_at=coalesce(accepted_at,?) where attempt_id=?
                """,event.messageDigest(),at(event.occurredAt()),target.attempt());
        store.jdbc().update("update reminder_provider_events set handoff_attempt_id=? where event_key=?",target.attempt(),event.providerEventId());
        String state,classification;
        switch(event.kind()){
            case AUTHORITATIVE_DELIVERY -> {
                store.jdbc().update("update reminder_provider_handoffs set delivered_at=coalesce(delivered_at,?) where attempt_id=?",at(event.occurredAt()),target.attempt());
                state="DELIVERED";classification="PROVIDER_DELIVERY";
            }
            case TERMINAL_FAILURE -> {
                store.jdbc().update("update reminder_provider_handoffs set failed_at=coalesce(failed_at,?) where attempt_id=?",at(event.occurredAt()),target.attempt());
                if(target.delivered())return "IGNORED";
                state="FAILED";classification="PROVIDER_FAILURE";
            }
            case ACCEPTANCE -> {
                if(target.delivered() || target.failed())return "IGNORED";
                state="ACCEPTED";classification="PROVIDER_SENT";
            }
            default -> throw new IllegalArgumentException("Unsupported provider event");
        }
        String correlation="meta-"+event.messageDigest();
        store.jdbc().update("""
                update reminder_attempts set outcome=?,finished_at=?,provider_correlation=? where id=? and outcome='PENDING'
                ""","FAILED".equals(state)?"FAILED":"ACCEPTED",at(received),correlation,target.attempt());
        store.jdbc().update("""
                update reminder_jobs set state=?,classification=?,provider_correlation=?,lease_token=null,lease_until=null,updated_at=? where id=?
                """,state,classification,correlation,at(received),job.id());
        audit.record(null,"MEDICATION_REMINDER_"+classification,"REMINDER_JOB",job.id());
        return "APPLIED";
    }
    private String optOut(VerifiedEvent event,Instant received){
        // Resolve only an explicitly allowlisted test destination; never accept an account ID in a callback.
        var phones=meta.getAllowedRecipients().stream().filter(p->MetaWhatsAppProperties.recipientDigest(p.substring(1)).equals(event.recipientDigest())).toList();
        if(phones.size()!=1)return "IGNORED";
        var users=store.jdbc().queryForList("select id from users where phone=? and phone_verified_at is not null",UUID.class,phones.getFirst());
        if(users.size()!=1)return "IGNORED";
        var id=identities.forUser(users.getFirst(),true);
        var p=store.preference(users.getFirst(),true);
        if(!bound(p,id) || !p.whatsapp())return "IGNORED";
        var grant=store.jdbc().queryForObject("""
                select max(recorded_at) from reminder_consent_events where user_id=? and link_generation=? and phone_binding=? and action='GRANTED'
                """,OffsetDateTime.class,p.userId(),p.generation(),p.phoneBinding());
        if(grant==null || event.occurredAt().isBefore(grant.toInstant().truncatedTo(ChronoUnit.SECONDS)))return "STALE";
        long version=p.version()+1;
        store.jdbc().update("update reminder_preferences set whatsapp_consent=false,version=?,whatsapp_version=?,updated_at=?,last_planned_at=null where user_id=?",version,version,at(received),p.userId());
        store.jdbc().update("""
                insert into reminder_consent_events(id,user_id,patient_link_id,link_generation,phone_binding,channel,action,purpose,policy_version,method,actor_user_id,preferences_version,recorded_at,withdrawn_at)
                values (?,?,?,?,?,'WHATSAPP','WITHDRAWN','MEDICATION_REMINDER',?,'PROVIDER_OPT_OUT',null,?,?,?)
                """,UUID.randomUUID(),p.userId(),p.linkId(),p.generation(),p.phoneBinding(),ReminderDtos.POLICY,version,at(received),at(received));
        store.jdbc().update("""
                update reminder_jobs set state='CANCELLED',classification='PROVIDER_OPT_OUT',lease_token=null,lease_until=null,updated_at=?
                where user_id=? and channel='WHATSAPP' and state in ('SCHEDULED','ELIGIBLE')
                """,at(received),p.userId());
        audit.record(null,"MEDICATION_REMINDER_PROVIDER_OPT_OUT","USER",p.userId());
        return "APPLIED";
    }
}
