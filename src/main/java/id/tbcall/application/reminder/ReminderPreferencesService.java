package id.tbcall.application.reminder;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.reminder.ReminderDtos.*;
import static id.tbcall.application.reminder.ReminderStore.*;

@Service @Transactional(isolation=Isolation.READ_COMMITTED)
public class ReminderPreferencesService {
    private final ReminderIdentity identities;private final ReminderStore store;private final ReminderProperties properties;
    private final AuditService audit;private final Clock clock;private final ReminderDestinations destinations;private final ChannelProviderProperties providers;
    public ReminderPreferencesService(ReminderIdentity identities,ReminderStore store,ReminderProperties properties,AuditService audit,Clock clock,ReminderDestinations destinations,ChannelProviderProperties providers){this.identities=identities;this.store=store;this.properties=properties;this.audit=audit;this.clock=clock;this.destinations=destinations;this.providers=providers;}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Preferences read(CurrentActor actor){var id=identities.self(actor,false);return view(store.preference(actor.userId(),false),id);}
    public Preferences update(CurrentActor actor,Change input,String match){
        var id=identities.self(actor,true);destinations.current(id,"TELEGRAM",true);var old=store.preference(actor.userId(),true);
        if(match==null || match.isBlank())throw new ApplicationFailure(428,"PRECONDITION_REQUIRED","Prasyarat perubahan diperlukan","Buka pengaturan sebelum menyimpan.");
        if(!match.matches("\"[0-9]+-[a-f0-9]{64}\""))throw ApplicationFailure.invalid("ETag pengingat tidak valid.");
        if(!etag(old,id).equals(match))throw ApplicationFailure.optimistic();
        if(input==null || input.whatsappConsent()==null || input.allDay()==null || input.riskAcknowledged()==null)throw ApplicationFailure.invalid("Isian pengingat tidak lengkap.");
        if(!POLICY.equals(input.policyVersion()))throw ApplicationFailure.invalid("Versi persetujuan tidak valid.");
        boolean whatsapp=input.whatsappConsent();
        boolean email=input.emailConsent()!=null?input.emailConsent():old!=null && old.email() && destinations.bound(old,id,"EMAIL");
        boolean telegram=input.telegramConsent()!=null?input.telegramConsent():old!=null && old.telegram() && destinations.bound(old,id,"TELEGRAM");
        if(whatsapp && (!id.verifiedPhone() || !input.riskAcknowledged()))throw ApplicationFailure.invalid("Nomor akun terverifikasi dan persetujuan risiko diperlukan.");
        if(email && (!id.verifiedEmail() || input.emailConsent()!=null && !Boolean.TRUE.equals(input.emailRiskAcknowledged())))throw ApplicationFailure.invalid("Email akun terverifikasi dan persetujuan risiko Email diperlukan.");
        var tg=destinations.current(id,"TELEGRAM",false);
        if(telegram && (tg==null || input.telegramConsent()!=null && !Boolean.TRUE.equals(input.telegramRiskAcknowledged())))throw ApplicationFailure.invalid("Tautan Telegram dan persetujuan risiko Telegram diperlukan.");
        boolean any=whatsapp || email || telegram;LocalTime from=null,until=null;
        if(any){
            if(input.timeZone()==null || !ZoneId.getAvailableZoneIds().contains(input.timeZone()))throw ApplicationFailure.invalid("Pilih zona waktu IANA.");
            if(input.allDay()){if(input.permittedFrom()!=null || input.permittedUntil()!=null)throw ApplicationFailure.invalid("Pilihan sepanjang hari tidak memakai batas jam.");}
            else{from=time(input.permittedFrom());until=time(input.permittedUntil());if(from.equals(until))throw ApplicationFailure.invalid("Batas jam harus berbeda.");}
        }
        String zone=any?input.timeZone():null;boolean allDay=any && input.allDay();
        boolean shared=old==null || !linkBound(old,id) || !Objects.equals(old.zone(),zone) || !Objects.equals(old.from(),from) || !Objects.equals(old.until(),until) || old.allDay()!=allDay;
        long version=old==null?1:old.version()+1;
        // Old WhatsApp-only clients retain their enrollment-renewal contract. A full
        // multi-channel form must not renew an unchanged channel just by including it.
        boolean legacy=input.emailConsent()==null && input.telegramConsent()==null;
        boolean whatsappChanged=legacy || shared || old==null || old.whatsapp()!=whatsapp || whatsapp && !destinations.bound(old,id,"WHATSAPP");
        boolean emailChanged=shared || old==null || old.email()!=email || email && !destinations.bound(old,id,"EMAIL");
        boolean telegramChanged=shared || old==null || old.telegram()!=telegram || telegram && !destinations.bound(old,id,"TELEGRAM");
        long whatsappVersion=whatsappChanged?version:old.whatsappVersion();
        long emailVersion=emailChanged?version:old.emailVersion(),telegramVersion=telegramChanged?version:old.telegramVersion();
        OffsetDateTime now=OffsetDateTime.now(clock);
        store.jdbc().update("""
                insert into reminder_preferences(user_id,patient_link_id,link_generation,phone_binding,version,whatsapp_consent,time_zone,permitted_from,permitted_until,all_day,policy_version,updated_at,
                    email_consent,telegram_consent,email_binding,telegram_binding,whatsapp_version,email_version,telegram_version)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(user_id) do update set patient_link_id=excluded.patient_link_id,
                link_generation=excluded.link_generation,phone_binding=excluded.phone_binding,version=excluded.version,
                whatsapp_consent=excluded.whatsapp_consent,time_zone=excluded.time_zone,permitted_from=excluded.permitted_from,
                permitted_until=excluded.permitted_until,all_day=excluded.all_day,policy_version=excluded.policy_version,updated_at=excluded.updated_at,last_planned_at=null,
                email_consent=excluded.email_consent,telegram_consent=excluded.telegram_consent,email_binding=excluded.email_binding,
                telegram_binding=excluded.telegram_binding,whatsapp_version=excluded.whatsapp_version,email_version=excluded.email_version,telegram_version=excluded.telegram_version
                """,id.userId(),id.linkId(),id.generation(),id.phoneBinding(),version,whatsapp,zone,from,until,allDay,POLICY,now,
                email,telegram,id.emailBinding(),tg==null?null:tg.binding(),whatsappVersion,emailVersion,telegramVersion);
        if(whatsappChanged)recordConsent("WHATSAPP",whatsapp,old!=null && old.whatsapp(),id.phoneBinding(),old,id,version,now);
        if(emailChanged)recordConsent("EMAIL",email,old!=null && old.email(),id.emailBinding(),old,id,version,now);
        if(telegramChanged)recordConsent("TELEGRAM",telegram,old!=null && old.telegram(),tg==null?null:tg.binding(),old,id,version,now);
        for(String channel:List.of("WHATSAPP","EMAIL","TELEGRAM")){
            if("WHATSAPP".equals(channel) && !whatsappChanged || "EMAIL".equals(channel) && !emailChanged || "TELEGRAM".equals(channel) && !telegramChanged)continue;
            store.jdbc().update("update reminder_jobs set state='CANCELLED',classification='CONSENT_CHANGED',lease_token=null,lease_until=null,updated_at=? where user_id=? and channel=? and state in ('SCHEDULED','ELIGIBLE')",now,id.userId(),channel);
        }
        audit.record(actor.userId(),"MEDICATION_REMINDER_PREFERENCES_CHANGED","USER",actor.userId());
        return view(store.preference(actor.userId(),false),id);
    }
    private void recordConsent(String channel,boolean enabled,boolean wasEnabled,String binding,Preference old,ReminderIdentity.Identity id,long version,OffsetDateTime now){
        if(!enabled && !wasEnabled)return;
        var link=!enabled && old!=null?old.linkId():id.linkId();var generation=!enabled && old!=null?old.generation():id.generation();
        var evidence=!enabled && old!=null?old.binding(channel):binding;
        store.jdbc().update("""
                insert into reminder_consent_events(id,user_id,patient_link_id,link_generation,phone_binding,destination_binding,channel,action,purpose,policy_version,method,actor_user_id,preferences_version,recorded_at,withdrawn_at)
                values (?,?,?,?,?,?,?,?,'MEDICATION_REMINDER',?,'SELF_PORTAL',?,?,?,?)
                """,UUID.randomUUID(),id.userId(),link,generation,"WHATSAPP".equals(channel)?evidence:null,"WHATSAPP".equals(channel)?null:evidence,channel,enabled?"GRANTED":"WITHDRAWN",POLICY,id.userId(),version,now,enabled?null:now);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public History history(CurrentActor actor,int page,int size){
        var id=identities.self(actor,false);
        if(page<0 || size<1 || size>20 || (long)page*size>10000)throw ApplicationFailure.invalid("Pagination pengingat tidak valid.");
        var items=store.jdbc().query("select id,scheduled_at,channel,state,attempt_count,classification,mode,created_at from reminder_jobs where user_id=? and link_generation=? order by scheduled_at desc,id limit ? offset ?",
                (r,n)->new HistoryItem(r.getObject("id",UUID.class),r.getObject("scheduled_at",OffsetDateTime.class),r.getString("channel"),r.getString("state"),r.getInt("attempt_count"),r.getString("classification"),r.getString("mode"),r.getObject("created_at",OffsetDateTime.class)),id.userId(),id.generation(),size,page*size);
        long total=store.jdbc().queryForObject("select count(*) from reminder_jobs where user_id=? and link_generation=?",Long.class,id.userId(),id.generation());
        return new History(items,page,size,total);
    }
    private Preferences view(Preference p,ReminderIdentity.Identity id){
        boolean bound=p==null || ReminderStore.bound(p,id),emailBound=p==null || destinations.bound(p,id,"EMAIL"),telegramBound=p==null || destinations.bound(p,id,"TELEGRAM");
        boolean settings=p!=null && linkBound(p,id);var tg=destinations.current(id,"TELEGRAM",false);
        String masked=id.verifiedPhone()?"••••"+id.phone().substring(Math.max(0,id.phone().length()-4)):null;
        String emailMask=id.verifiedEmail()?id.email().substring(0,1)+"••••@"+id.email().substring(id.email().indexOf('@')+1):null;
        String tgMask=tg==null?null:"••••"+tg.value().substring(Math.max(0,tg.value().length()-4));
        boolean channelMode=properties.getMode()==ReminderProperties.Mode.CHANNEL_TEST;
        return new Preferences(p==null?0:p.version(),p!=null && bound && id.verifiedPhone() && p.whatsapp(),settings?p.zone():null,
                !settings || p.from()==null?null:p.from().toString(),!settings || p.until()==null?null:p.until().toString(),settings && p.allDay(),
                id.verifiedPhone(),masked,bound,properties.getMode().name(),POLICY,p!=null && emailBound && p.email(),p!=null && telegramBound && p.telegram(),
                id.verifiedEmail(),emailMask,emailBound,telegramBound,tg!=null,tgMask,channelMode && providers.isEmailEnabled(),channelMode && providers.isTelegramEnabled(),etag(p,id));
    }
    private String etag(Preference p,ReminderIdentity.Identity id){
        var tg=destinations.current(id,"TELEGRAM",false);
        return "\""+(p==null?0:p.version())+"-"+ReminderIdentity.digest(id.generation()+"/"+id.phoneBinding()+"/"+id.emailBinding()+"/"+(tg==null?"":tg.binding()))+"\"";
    }
    private LocalTime time(String value){if(value==null || !value.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))throw ApplicationFailure.invalid("Jam harus berformat HH:mm.");return LocalTime.parse(value);}
}
