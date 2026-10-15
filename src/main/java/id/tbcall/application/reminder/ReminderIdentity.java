package id.tbcall.application.reminder;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ReminderIdentity {
    public record Identity(UUID userId,UUID patientId,UUID linkId,String generation,String phone,String phoneBinding,
            boolean verifiedPhone,boolean active,boolean patientRole){
        @Override public String toString(){return "ReminderIdentity[contact=redacted]";}
    }
    private final JdbcTemplate jdbc;private final AuditService audit;
    public ReminderIdentity(JdbcTemplate jdbc,AuditService audit){this.jdbc=jdbc;this.audit=audit;}
    public Identity self(CurrentActor actor,boolean lock){
        Identity id=forUser(actor.userId(),lock);
        if(!actor.hasRole("PATIENT") || id==null || !id.active() || !id.patientRole() || !id.patientId().equals(actor.selfPatientId())){
            audit.authorizationDenied(actor.userId());throw ApplicationFailure.forbidden();
        }
        return id;
    }
    public Identity forUser(UUID user,boolean lock){
        var links=jdbc.queryForList("select patient_id from patient_user_links where user_id=? and relationship_type='SELF' and verification_status='VERIFIED'",UUID.class,user);
        if(links.size()!=1)return null;
        if(lock){
            jdbc.queryForList("select id from patients where id=? for update",links.getFirst());
            // Still conflicts with identity writers, but allows the denial audit's FK KEY SHARE.
            jdbc.queryForList("select id from users where id=? for no key update",user);
        }
        var rows=jdbc.query("""
                select u.id,u.status,u.phone,u.phone_verified_at,l.id link_id,l.patient_id,l.version,l.verified_at,
                    (exists(select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=u.id and r.code='PATIENT')
                     and not exists(select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=u.id and r.code<>'PATIENT')) patient_role
                from users u join patient_user_links l on l.user_id=u.id
                where u.id=? and l.patient_id=? and l.relationship_type='SELF' and l.verification_status='VERIFIED'
                """+(lock?" for update of l":""),(rs,n)->{
            UUID link=rs.getObject("link_id",UUID.class);OffsetDateTime verified=rs.getObject("verified_at",OffsetDateTime.class);
            String phone=rs.getString("phone");OffsetDateTime phoneAt=rs.getObject("phone_verified_at",OffsetDateTime.class);
            boolean phoneVerified=phone!=null && phoneAt!=null;
            return new Identity(user,rs.getObject("patient_id",UUID.class),link,
                    digest(link+"/"+rs.getLong("version")+"/"+(verified==null?"":verified.toInstant())),phone,
                    phoneVerified?digest(user+"/"+phone+"/"+phoneAt.toInstant()):null,
                    phoneVerified,"ACTIVE".equals(rs.getString("status")),rs.getBoolean("patient_role"));
        },user,links.getFirst());
        return rows.size()==1?rows.getFirst():null;
    }
    // Change detector only, not anonymization. No duplicate contact value is retained.
    public static String digest(String input){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
}
