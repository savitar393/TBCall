package id.tbcall.application.reminder;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReminderStore {
    public record Preference(UUID userId,UUID linkId,String generation,String phoneBinding,long version,boolean whatsapp,
            String zone,LocalTime from,LocalTime until,boolean allDay,boolean email,boolean telegram,
            String emailBinding,String telegramBinding,long whatsappVersion,long emailVersion,long telegramVersion){
        public long enrollmentVersion(String channel){return switch(channel){case "WHATSAPP"->whatsappVersion;case "EMAIL"->emailVersion;case "TELEGRAM"->telegramVersion;default->-1;};}
        public String binding(String channel){return switch(channel){case "WHATSAPP"->phoneBinding;case "EMAIL"->emailBinding;case "TELEGRAM"->telegramBinding;default->null;};}
    }
    public record Job(UUID id,UUID userId,UUID linkId,String generation,String phoneBinding,long preferenceVersion,
            UUID treatmentId,UUID scheduleId,UUID revisionId,OffsetDateTime scheduledAt,String logicalKey,UUID idempotency,
            String channel,String state,int attempts,UUID lease,OffsetDateTime leaseUntil,String mode,String destinationBinding){}
    private final JdbcTemplate jdbc;
    public ReminderStore(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public JdbcTemplate jdbc(){return jdbc;}
    public Preference preference(UUID user,boolean lock){
        var rows=jdbc.query("select * from reminder_preferences where user_id=?"+(lock?" for update":""),(rs,n)->preference(rs),user);
        return rows.isEmpty()?null:rows.getFirst();
    }
    public Job job(UUID id,boolean lock){
        var rows=jdbc.query("select * from reminder_jobs where id=?"+(lock?" for update":""),(rs,n)->job(rs),id);
        return rows.isEmpty()?null:rows.getFirst();
    }
    private Preference preference(ResultSet r)throws SQLException{return new Preference(r.getObject("user_id",UUID.class),r.getObject("patient_link_id",UUID.class),r.getString("link_generation"),r.getString("phone_binding"),r.getLong("version"),r.getBoolean("whatsapp_consent"),r.getString("time_zone"),r.getObject("permitted_from",LocalTime.class),r.getObject("permitted_until",LocalTime.class),r.getBoolean("all_day"),r.getBoolean("email_consent"),r.getBoolean("telegram_consent"),r.getString("email_binding"),r.getString("telegram_binding"),r.getObject("whatsapp_version")==null?r.getLong("version"):r.getLong("whatsapp_version"),r.getLong("email_version"),r.getLong("telegram_version"));}
    private Job job(ResultSet r)throws SQLException{return new Job(r.getObject("id",UUID.class),r.getObject("user_id",UUID.class),r.getObject("patient_link_id",UUID.class),r.getString("link_generation"),r.getString("phone_binding"),r.getLong("preferences_version"),r.getObject("treatment_id",UUID.class),r.getObject("schedule_id",UUID.class),r.getObject("revision_id",UUID.class),r.getObject("scheduled_at",OffsetDateTime.class),r.getString("logical_key"),r.getObject("idempotency_key",UUID.class),r.getString("channel"),r.getString("state"),r.getInt("attempt_count"),r.getObject("lease_token",UUID.class),r.getObject("lease_until",OffsetDateTime.class),r.getString("mode"),r.getString("channel").equals("WHATSAPP")?r.getString("phone_binding"):r.getString("destination_binding"));}
    public static OffsetDateTime at(Instant instant){return instant.atOffset(ZoneOffset.UTC);}
    public static boolean bound(Preference p,ReminderIdentity.Identity id){return p!=null && id!=null && p.linkId().equals(id.linkId()) && p.generation().equals(id.generation()) && Objects.equals(p.phoneBinding(),id.phoneBinding());}
    public static boolean linkBound(Preference p,ReminderIdentity.Identity id){return p!=null && id!=null && p.linkId().equals(id.linkId()) && p.generation().equals(id.generation());}
    public static boolean consent(Preference p,String channel){return p!=null && switch(channel){case "WHATSAPP"->p.whatsapp();case "EMAIL"->p.email();case "TELEGRAM"->p.telegram();default->false;};}
    public static boolean permitted(Preference p,Instant instant){
        if(p.zone()==null)return false;
        LocalTime local=instant.atZone(ZoneId.of(p.zone())).toLocalTime();
        if(p.allDay())return true;
        if(p.from()==null || p.until()==null)return false;
        return p.from().isBefore(p.until()) ? !local.isBefore(p.from()) && local.isBefore(p.until())
                : !local.isBefore(p.from()) || local.isBefore(p.until());
    }
}
