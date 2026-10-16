package id.tbcall.application.reminder;

import com.fasterxml.jackson.annotation.JsonIgnore;
import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service @Transactional(isolation=Isolation.READ_COMMITTED)
public class TelegramLinkService {
    public record Status(long version,boolean linked,String maskedChat,String botUsername,boolean available,@JsonIgnore String etag){
        @Override public String toString(){return "TelegramStatus[version="+version+",linked="+linked+"]";}
    }
    public record LinkIntent(String deepLink,OffsetDateTime expiresAt){@Override public String toString(){return "TelegramLinkIntent[redacted]";}}
    private final ReminderIdentity identities;private final TelegramLinkStore store;private final ChannelProviderProperties properties;private final ReminderProperties reminders;private final AuditService audit;private final Clock clock;
    private final SecureRandom random=new SecureRandom();
    public TelegramLinkService(ReminderIdentity identities,TelegramLinkStore store,ChannelProviderProperties properties,ReminderProperties reminders,AuditService audit,Clock clock){this.identities=identities;this.store=store;this.properties=properties;this.reminders=reminders;this.audit=audit;this.clock=clock;}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Status read(CurrentActor actor){var id=identities.self(actor,false);return status(id,store.link(id.userId(),false));}
    public LinkIntent create(CurrentActor actor,String match){
        var id=identities.self(actor,true);var row=store.link(id.userId(),true);check(match,status(id,row).etag());
        if(!available())throw ApplicationFailure.forbidden();
        if(store.bound(row,id) && row.chat()!=null)throw ApplicationFailure.conflict("Putuskan tautan Telegram sebelum menautkan kembali.");
        OffsetDateTime now=OffsetDateTime.now(clock),expires=now.plusMinutes(5);long version=row==null?1:row.version()+1;
        store.withdraw(id,id.userId(),"SELF_PORTAL",now,true);store.invalidateTokens(id.userId(),now);
        store.jdbc().update("""
            insert into reminder_telegram_links(user_id,patient_link_id,link_generation,bot_key,version,updated_at)
            values (?,?,?,?,?,?) on conflict(user_id) do update set patient_link_id=excluded.patient_link_id,link_generation=excluded.link_generation,
            bot_key=excluded.bot_key,chat_id=null,linked_at=null,version=excluded.version,updated_at=excluded.updated_at
            """,id.userId(),id.linkId(),id.generation(),store.botKey(),version,now);
        byte[] entropy=new byte[32];random.nextBytes(entropy);String nonce=Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);Arrays.fill(entropy,(byte)0);
        store.jdbc().update("insert into reminder_telegram_link_tokens(token_digest,user_id,patient_link_id,link_generation,bot_key,created_at,expires_at) values (?,?,?,?,?,?,?)",ReminderIdentity.digest(nonce),id.userId(),id.linkId(),id.generation(),store.botKey(),now,expires);
        audit.record(id.userId(),"MEDICATION_REMINDER_TELEGRAM_LINK_REQUESTED","USER",id.userId());
        return new LinkIntent("https://t.me/"+properties.getTelegramBotUsername()+"?start="+nonce,expires);
    }
    public Status unlink(CurrentActor actor,String match){
        var id=identities.self(actor,true);var row=store.link(id.userId(),true);check(match,status(id,row).etag());
        OffsetDateTime now=OffsetDateTime.now(clock);
        boolean pending=!store.jdbc().queryForList("select token_digest from reminder_telegram_link_tokens where user_id=? and consumed_at is null",String.class,id.userId()).isEmpty();
        if((row==null || row.chat()==null) && !pending)return status(id,row);
        // Current ETag is mandatory even for an already disconnected account.
        store.withdraw(id,id.userId(),"SELF_PORTAL",now,true);store.invalidateTokens(id.userId(),now);
        if(row!=null)store.jdbc().update("update reminder_telegram_links set chat_id=null,linked_at=null,version=version+1,updated_at=? where user_id=?",now,id.userId());
        audit.record(id.userId(),"MEDICATION_REMINDER_TELEGRAM_UNLINKED","USER",id.userId());return status(id,store.link(id.userId(),false));
    }
    private Status status(ReminderIdentity.Identity id,TelegramLinkStore.Link row){
        boolean linked=store.bound(row,id) && row.chat()!=null;String masked=linked?"••••"+(row.chat().length()>4?row.chat().substring(row.chat().length()-2):""):null;long version=row==null?0:row.version();
        return new Status(version,linked,masked,botUsername(),available(),"\""+version+"-"+ReminderIdentity.digest(id.generation()+"/"+store.botKey())+"\"");
    }
    private String botUsername(){String value=properties.getTelegramBotUsername();return value!=null && value.matches("[A-Za-z][A-Za-z0-9_]{4,31}")?value:null;}
    private boolean available(){String username=botUsername(),key=store.botKey();return reminders.getMode()==ReminderProperties.Mode.CHANNEL_TEST && properties.isTelegramEnabled() && username!=null && username.matches("[A-Za-z][A-Za-z0-9_]{4,31}") && key!=null && key.matches("[a-f0-9]{64}");}
    private void check(String match,String expected){
        if(match==null || match.isBlank())throw new ApplicationFailure(428,"PRECONDITION_REQUIRED","Prasyarat perubahan diperlukan","Buka pengaturan sebelum menyimpan.");
        if(!match.matches("\"[0-9]+-[a-f0-9]{64}\""))throw ApplicationFailure.invalid("ETag Telegram tidak valid.");
        if(!expected.equals(match))throw ApplicationFailure.optimistic();
    }
}
