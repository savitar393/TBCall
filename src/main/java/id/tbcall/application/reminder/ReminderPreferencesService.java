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
    private final AuditService audit;private final Clock clock;
    public ReminderPreferencesService(ReminderIdentity identities,ReminderStore store,ReminderProperties properties,AuditService audit,Clock clock){this.identities=identities;this.store=store;this.properties=properties;this.audit=audit;this.clock=clock;}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Preferences read(CurrentActor actor){var id=identities.self(actor,false);return view(store.preference(actor.userId(),false),id);}
    public Preferences update(CurrentActor actor,Change input,String match){
        var id=identities.self(actor,true);var old=store.preference(actor.userId(),true);
        if(match==null || match.isBlank())throw new ApplicationFailure(428,"PRECONDITION_REQUIRED","Prasyarat perubahan diperlukan","Buka pengaturan sebelum menyimpan.");
        if(!match.matches("\"[0-9]+-[a-f0-9]{64}\""))throw ApplicationFailure.invalid("ETag pengingat tidak valid.");
        if(!etag(old,id).equals(match))throw ApplicationFailure.optimistic();
        if(input==null || input.whatsappConsent()==null || input.allDay()==null || input.riskAcknowledged()==null)throw ApplicationFailure.invalid("Isian pengingat tidak lengkap.");
        boolean enabled=input.whatsappConsent();
        if(!POLICY.equals(input.policyVersion()))throw ApplicationFailure.invalid("Versi persetujuan tidak valid.");
        if(enabled && (!id.verifiedPhone() || !input.riskAcknowledged()))throw ApplicationFailure.invalid("Nomor akun terverifikasi dan persetujuan risiko diperlukan.");
        LocalTime from=null,until=null;
        if(enabled){
            if(input.timeZone()==null || !ZoneId.getAvailableZoneIds().contains(input.timeZone()))throw ApplicationFailure.invalid("Pilih zona waktu IANA.");
            if(input.allDay()){
                if(input.permittedFrom()!=null || input.permittedUntil()!=null)throw ApplicationFailure.invalid("Pilihan sepanjang hari tidak memakai batas jam.");
            }else{from=time(input.permittedFrom());until=time(input.permittedUntil());if(from.equals(until))throw ApplicationFailure.invalid("Batas jam harus berbeda.");}
        }
        long version=old==null?1:old.version()+1;OffsetDateTime now=OffsetDateTime.now(clock);
        store.jdbc().update("""
                insert into reminder_preferences(user_id,patient_link_id,link_generation,phone_binding,version,whatsapp_consent,time_zone,permitted_from,permitted_until,all_day,policy_version,updated_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?) on conflict(user_id) do update set patient_link_id=excluded.patient_link_id,
                link_generation=excluded.link_generation,phone_binding=excluded.phone_binding,version=excluded.version,
                whatsapp_consent=excluded.whatsapp_consent,time_zone=excluded.time_zone,permitted_from=excluded.permitted_from,
                permitted_until=excluded.permitted_until,all_day=excluded.all_day,policy_version=excluded.policy_version,updated_at=excluded.updated_at,last_planned_at=null
                """,id.userId(),id.linkId(),id.generation(),id.phoneBinding(),version,enabled,enabled?input.timeZone():null,from,until,enabled && input.allDay(),POLICY,now);
        if(enabled || old!=null && old.whatsapp())store.jdbc().update("""
                    insert into reminder_consent_events(id,user_id,patient_link_id,link_generation,phone_binding,channel,action,purpose,policy_version,method,actor_user_id,preferences_version,recorded_at,withdrawn_at)
                    values (?,?,?,?,?,'WHATSAPP',?,'MEDICATION_REMINDER',?,'SELF_PORTAL',?,?,?,?)
                    """,UUID.randomUUID(),id.userId(),id.linkId(),id.generation(),id.phoneBinding(),enabled?"GRANTED":"WITHDRAWN",POLICY,id.userId(),version,now,enabled?null:now);
        // Only pre-handoff work can be cancelled. Accepted/uncertain handoffs are historical facts.
        store.jdbc().update("update reminder_jobs set state='CANCELLED',classification='CONSENT_CHANGED',lease_token=null,lease_until=null,updated_at=? where user_id=? and state in ('SCHEDULED','ELIGIBLE')",now,id.userId());
        audit.record(actor.userId(),"MEDICATION_REMINDER_PREFERENCES_CHANGED","USER",actor.userId());
        return view(store.preference(actor.userId(),false),id);
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
        boolean bound=p==null || ReminderStore.bound(p,id);boolean enabled=bound && id.verifiedPhone();
        String masked=id.verifiedPhone()?"••••"+id.phone().substring(Math.max(0,id.phone().length()-4)):null;
        return new Preferences(p==null?0:p.version(),p!=null && enabled && p.whatsapp(),p==null || !bound?null:p.zone(),p==null || !bound || p.from()==null?null:p.from().toString(),p==null || !bound || p.until()==null?null:p.until().toString(),p!=null && bound && p.allDay(),id.verifiedPhone(),masked,bound,properties.getMode().name(),POLICY,etag(p,id));
    }
    private String etag(Preference p,ReminderIdentity.Identity id){
        // Consent may never be silently rebound by a form opened for a different verified destination/link.
        return "\""+(p==null?0:p.version())+"-"+ReminderIdentity.digest(id.generation()+"/"+id.phoneBinding())+"\"";
    }
    private LocalTime time(String value){if(value==null || !value.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))throw ApplicationFailure.invalid("Jam harus berformat HH:mm.");return LocalTime.parse(value);}
}
