package id.tbcall.application.reminder;

import id.tbcall.application.common.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Short transactions only. The consumer lease spans network calls without holding a transaction. */
@Service @Transactional(isolation=Isolation.READ_COMMITTED)
public class TelegramPollWorker {
    public record Lease(String botKey,UUID token,long lastUpdateId){@Override public String toString(){return "TelegramPollLease[redacted]";}}
    private record Consumer(long last,UUID token,OffsetDateTime until){}
    private List<Consumer> consumers(String key){return jdbc.query("select * from reminder_telegram_consumers where bot_key=? for update",(r,n)->new Consumer(r.getLong("last_update_id"),r.getObject("lease_token",UUID.class),r.getObject("lease_until",OffsetDateTime.class)),key);}
    private final JdbcTemplate jdbc;private final TelegramLinkStore store;private final ReminderIdentity identities;private final ChannelProviderProperties properties;private final AuditService audit;private final Clock clock;
    public TelegramPollWorker(JdbcTemplate jdbc,TelegramLinkStore store,ReminderIdentity identities,ChannelProviderProperties properties,AuditService audit,Clock clock){this.jdbc=jdbc;this.store=store;this.identities=identities;this.properties=properties;this.audit=audit;this.clock=clock;}
    public Lease claim(){
        String key=properties.botKey();if(key==null)return null;OffsetDateTime now=OffsetDateTime.now(clock);
        jdbc.update("insert into reminder_telegram_consumers(bot_key,last_update_id) values (?,-1) on conflict(bot_key) do nothing",key);
        var row=consumers(key).getFirst();
        OffsetDateTime until=row.until();if(until!=null && until.isAfter(now))return null;
        UUID token=UUID.randomUUID();jdbc.update("update reminder_telegram_consumers set lease_token=?,lease_until=? where bot_key=?",token,now.plusSeconds(60),key);
        return new Lease(key,token,row.last());
    }
    public void release(Lease lease){if(lease!=null)jdbc.update("update reminder_telegram_consumers set lease_token=null,lease_until=null where bot_key=? and lease_token=?",lease.botKey(),lease.token());}
    public boolean apply(Lease lease,TelegramUpdateParser.Update update){
        if(lease==null || update==null)return false;
        var consumers=consumers(lease.botKey());
        if(consumers.isEmpty())return false;var consumer=consumers.getFirst();
        OffsetDateTime until=consumer.until();
        if(!lease.token().equals(consumer.token()) || until==null || !until.toInstant().isAfter(clock.instant()) || !Objects.equals(lease.botKey(),properties.botKey()))return false;
        long last=consumer.last();if(update.updateId()<=last)return true;
        if(update.updateId()<0)return false;
        String result="IGNORED";
        Instant now=clock.instant();
        long maxAge=update.command()==TelegramUpdateParser.Command.STOP?TelegramUpdateParser.STOP_MAX_AGE_SECONDS:TelegramUpdateParser.START_MAX_AGE_SECONDS;
        if(update.command()!=TelegramUpdateParser.Command.IGNORE && update.chat()!=null && update.chat().matches("[1-9][0-9]{0,15}") && (update.command()==TelegramUpdateParser.Command.STOP || properties.telegramAllowed(update.chat()))
                && update.occurredAt()!=null && !update.occurredAt().isBefore(now.minusSeconds(maxAge)) && !update.occurredAt().isAfter(now.plusSeconds(300))){
            result=update.command()==TelegramUpdateParser.Command.START?start(lease,update):stop(lease,update);
        }
        // If application work exceeded the lease, roll it back together with the offset.
        if(!until.toInstant().isAfter(clock.instant()))throw ApplicationFailure.forbidden();
        jdbc.update("insert into reminder_telegram_updates(bot_key,update_id,result,received_at) values (?,?,?,?) on conflict(bot_key,update_id) do nothing",lease.botKey(),update.updateId(),result,OffsetDateTime.now(clock));
        jdbc.update("update reminder_telegram_consumers set last_update_id=? where bot_key=? and lease_token=?",update.updateId(),lease.botKey(),lease.token());
        return true;
    }
    private String start(Lease lease,TelegramUpdateParser.Update event){
        if(event.tokenDigest()==null)return "IGNORED";var intent=store.token(event.tokenDigest(),false);if(intent==null)return "IGNORED";
        var id=identities.forUser(intent.user(),true);
        if(!valid(id) || !intent.link().equals(id.linkId()) || !intent.generation().equals(id.generation()) || !intent.bot().equals(lease.botKey()))return "IGNORED";
        // Serialize ownership of a private chat across bot identities as well as accounts.
        jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))",event.chat());
        var link=store.link(id.userId(),true);
        jdbc.queryForList("select user_id from reminder_preferences where user_id=? for update",id.userId());
        intent=store.token(event.tokenDigest(),true);Instant now=clock.instant();
        if(intent==null || intent.consumed()!=null || !intent.expires().toInstant().isAfter(now) || !store.bound(link,id) || link.chat()!=null
                || event.occurredAt().isBefore(intent.created().toInstant().truncatedTo(ChronoUnit.SECONDS)) || !event.occurredAt().isBefore(intent.expires().toInstant()))return "IGNORED";
        if(!jdbc.queryForList("select user_id from reminder_telegram_links where chat_id=? and user_id<>?",UUID.class,event.chat(),id.userId()).isEmpty())return "IGNORED";
        OffsetDateTime at=OffsetDateTime.now(clock);
        store.withdraw(id,id.userId(),"SELF_PORTAL",at,true);
        jdbc.update("update reminder_telegram_links set chat_id=?,linked_at=?,version=version+1,updated_at=? where user_id=?",event.chat(),at,at,id.userId());
        store.invalidateTokens(id.userId(),at);audit.record(null,"MEDICATION_REMINDER_TELEGRAM_LINKED","USER",id.userId());return "APPLIED";
    }
    private String stop(Lease lease,TelegramUpdateParser.Update event){
        var users=jdbc.queryForList("select user_id from reminder_telegram_links where bot_key=? and chat_id=?",UUID.class,lease.botKey(),event.chat());if(users.size()!=1)return "IGNORED";
        var id=identities.forUser(users.getFirst(),true);if(id==null)return "IGNORED";var link=store.link(id.userId(),true);
        if(!store.bound(link,id) || !event.chat().equals(link.chat()))return "IGNORED";
        jdbc.queryForList("select user_id from reminder_preferences where user_id=? for update",id.userId());
        var grants=jdbc.queryForList("select recorded_at from reminder_consent_events where user_id=? and link_generation=? and channel='TELEGRAM' and action='GRANTED' and destination_binding=? order by recorded_at desc limit 1",OffsetDateTime.class,id.userId(),id.generation(),TelegramLinkStore.binding(link));
        if(event.occurredAt().isBefore(link.linkedAt().toInstant().truncatedTo(ChronoUnit.SECONDS)) || !grants.isEmpty() && event.occurredAt().isBefore(grants.getFirst().toInstant().truncatedTo(ChronoUnit.SECONDS)))return "STALE";
        store.withdraw(id,null,"PROVIDER_OPT_OUT",OffsetDateTime.now(clock),false);audit.record(null,"MEDICATION_REMINDER_TELEGRAM_OPT_OUT","USER",id.userId());return "APPLIED";
    }
    private boolean valid(ReminderIdentity.Identity id){return id!=null && id.active() && id.patientRole();}
}
