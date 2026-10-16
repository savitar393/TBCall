package id.tbcall.application.reminder;

import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import static id.tbcall.application.reminder.ReminderStore.at;

/** Called inside the existing job transaction, with its job lock already held. */
@Component
public class ReminderProviderState {
    private final ReminderStore store;
    private final MetaWhatsAppProperties meta;
    public ReminderProviderState(ReminderStore store,MetaWhatsAppProperties meta){this.store=store;this.meta=meta;}
    public void register(UUID attempt,UUID token,String phone,Instant now){
        store.jdbc().update("""
                insert into reminder_provider_handoffs(attempt_id,callback_token,business_account_id,phone_number_id,recipient_digest,created_at)
                values (?,?,?,?,?,?)
                """,attempt,token,meta.getBusinessAccountId(),meta.getTestPhoneNumberId(),MetaWhatsAppProperties.recipientDigest(phone.substring(1)),at(now));
    }
    public boolean accepted(UUID token,String correlation,Instant now){
        if(token==null || correlation==null || !correlation.matches("meta-[a-f0-9]{64}"))return false;
        String digest=correlation.substring(5);
        return store.jdbc().update("""
                update reminder_provider_handoffs set message_digest=?,accepted_at=coalesce(accepted_at,?)
                where callback_token=? and (message_digest is null or message_digest=?)
                """,digest,at(now),token,digest)==1;
    }
    public boolean previouslyAccepted(String logicalKey){
        return store.jdbc().queryForObject("""
                select exists(select 1 from reminder_provider_handoffs h join reminder_attempts a on a.id=h.attempt_id
                join reminder_jobs j on j.id=a.job_id where j.logical_key=? and h.accepted_at is not null)
                """,Boolean.class,logicalKey);
    }
}
