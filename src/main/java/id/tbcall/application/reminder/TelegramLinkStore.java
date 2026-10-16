package id.tbcall.application.reminder;

import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TelegramLinkStore {
    public record Destination(String value,String binding){@Override public String toString(){return "TelegramDestination[redacted]";}}
    record Link(UUID user,UUID link,String generation,String bot,String chat,long version,OffsetDateTime linkedAt){
        @Override public String toString(){return "TelegramLink[redacted]";}
    }
    record Token(String digest,UUID user,UUID link,String generation,String bot,OffsetDateTime created,OffsetDateTime expires,OffsetDateTime consumed){
        @Override public String toString(){return "TelegramToken[redacted]";}
    }
    private final JdbcTemplate jdbc;private final ChannelProviderProperties properties;
    public TelegramLinkStore(JdbcTemplate jdbc,ChannelProviderProperties properties){this.jdbc=jdbc;this.properties=properties;}
    JdbcTemplate jdbc(){return jdbc;}
    String botKey(){try{return properties.botKey();}catch(IllegalStateException ex){return null;}}
    Link link(UUID user,boolean lock){return jdbc.query("select * from reminder_telegram_links where user_id=?"+(lock?" for update":""),(r,n)->new Link(user,r.getObject("patient_link_id",UUID.class),r.getString("link_generation"),r.getString("bot_key"),r.getString("chat_id"),r.getLong("version"),r.getObject("linked_at",OffsetDateTime.class)),user).stream().findFirst().orElse(null);}
    Token token(String digest,boolean lock){return jdbc.query("select * from reminder_telegram_link_tokens where token_digest=?"+(lock?" for update":""),(r,n)->new Token(digest,r.getObject("user_id",UUID.class),r.getObject("patient_link_id",UUID.class),r.getString("link_generation"),r.getString("bot_key"),r.getObject("created_at",OffsetDateTime.class),r.getObject("expires_at",OffsetDateTime.class),r.getObject("consumed_at",OffsetDateTime.class)),digest).stream().findFirst().orElse(null);}
    public Destination current(ReminderIdentity.Identity id,boolean lock){
        if(id==null || !id.active() || !id.patientRole())return null;
        Link row=link(id.userId(),lock);return bound(row,id) && row.chat()!=null?new Destination(row.chat(),binding(row)):null;
    }
    boolean bound(Link row,ReminderIdentity.Identity id){return row!=null && row.link().equals(id.linkId()) && row.generation().equals(id.generation()) && Objects.equals(row.bot(),botKey());}
    static String binding(Link row){return row==null || row.chat()==null?null:ReminderIdentity.digest(row.user()+"/"+row.generation()+"/"+row.bot()+"/"+row.chat()+"/"+row.version()+"/"+row.linkedAt().toInstant());}
    void invalidateTokens(UUID user,OffsetDateTime now){jdbc.update("update reminder_telegram_link_tokens set consumed_at=? where user_id=? and consumed_at is null",now,user);}
    /** Called only after identity and Telegram binding locks. Consent changes remain channel scoped. */
    void withdraw(ReminderIdentity.Identity id,UUID actor,String method,OffsetDateTime now,boolean touch){
        var rows=jdbc.queryForList("select * from reminder_preferences where user_id=? for update",id.userId());
        if(!rows.isEmpty()){
            var p=rows.getFirst();boolean enabled=Boolean.TRUE.equals(p.get("telegram_consent"));
            if(enabled || touch){
                long version=((Number)p.get("version")).longValue()+1;
                jdbc.update("update reminder_preferences set telegram_consent=false,telegram_binding=null,version=?,telegram_version=?,last_planned_at=null,updated_at=? where user_id=?",version,version,now,id.userId());
                if(enabled)jdbc.update("""
                    insert into reminder_consent_events(id,user_id,patient_link_id,link_generation,phone_binding,destination_binding,channel,action,purpose,policy_version,method,actor_user_id,preferences_version,recorded_at,withdrawn_at)
                    values (?,?,?,?,null,?,'TELEGRAM','WITHDRAWN','MEDICATION_REMINDER',?,?,?,?,?,?)
                    """,UUID.randomUUID(),id.userId(),p.get("patient_link_id"),p.get("link_generation"),p.get("telegram_binding"),p.get("policy_version"),method,actor,version,now,now);
            }
        }
        jdbc.update("update reminder_jobs set state='CANCELLED',classification='CONSENT_CHANGED',lease_token=null,lease_until=null,updated_at=? where user_id=? and channel='TELEGRAM' and state in ('SCHEDULED','ELIGIBLE')",now,id.userId());
    }
}
