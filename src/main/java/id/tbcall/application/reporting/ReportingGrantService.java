package id.tbcall.application.reporting;

import id.tbcall.application.admin.AdministrativeUsers;
import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.web.IfMatch;
import java.sql.ResultSet;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.reporting.ReportingDtos.*;

@Service @Transactional
public class ReportingGrantService {
    private final ReportingAccess access; private final ReportingCatalogue catalogue; private final AdministrativeUsers users;
    private final JdbcTemplate jdbc; private final AuditService audit; private final Clock clock;
    public ReportingGrantService(ReportingAccess access,ReportingCatalogue catalogue,AdministrativeUsers users,JdbcTemplate jdbc,AuditService audit,Clock clock) {
        this.access=access; this.catalogue=catalogue; this.users=users; this.jdbc=jdbc; this.audit=audit; this.clock=clock;
    }
    public Grant assign(CurrentActor actor,UUID user,String scope,String code) {
        access.lockAdministrationUsers(actor,user);
        access.admin(actor,"REPORT_SCOPE_MANAGE"); catalogue.requireVerified(); catalogue.geography(scope,code);
        users.activeVerified(user);
        if(!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=? and r.code='PROGRAM_MONITOR')",Boolean.class,user)))
            throw ApplicationFailure.invalid("Tujuan harus memiliki peran pemantau program.");
        if(!listRows(user).stream().filter(g -> g.revokedAt()==null).noneMatch(g -> g.scope().equals(scope) && Objects.equals(g.regionCode(),code)))
            throw new ApplicationFailure(409,"REPORT_GRANT_EXISTS","Penugasan sudah ada","Penugasan aktif yang sama telah tersimpan.");
        UUID id=UUID.randomUUID();
        jdbc.update("insert into reporting_grants(id,user_id,catalogue_version,scope,region_code,assigned_by,assigned_at) values (?,?,?,?,?,?,?)",id,user,ReportingCatalogue.VERSION,scope,code,actor.userId(),OffsetDateTime.now(clock));
        audit.record(actor.userId(),"REPORT_SCOPE_ASSIGNED","REPORTING_GRANT",id);
        return find(user,id,false);
    }
    public List<Grant> list(CurrentActor actor,UUID user) {
        access.lockAdministrationUsers(actor,user);
        access.admin(actor,"REPORT_SCOPE_MANAGE"); users.lock(user); return listRows(user);
    }
    public Grant read(CurrentActor actor,UUID user,UUID id) {
        access.admin(actor,"REPORT_SCOPE_MANAGE"); return find(user,id,false);
    }
    public Grant revoke(CurrentActor actor,UUID user,UUID id,String match) {
        access.lockAdministrationUsers(actor,user);
        access.admin(actor,"REPORT_SCOPE_MANAGE"); users.lock(user);
        Grant grant=find(user,id,true); IfMatch.require(match,grant.version());
        if(grant.revokedAt()!=null) throw ApplicationFailure.optimistic();
        jdbc.update("update reporting_grants set revoked_at=?,revoked_by=?,version=version+1 where id=?",OffsetDateTime.now(clock),actor.userId(),id);
        audit.record(actor.userId(),"REPORT_SCOPE_REVOKED","REPORTING_GRANT",id);
        return find(user,id,false);
    }
    private List<Grant> listRows(UUID user) { return jdbc.query("select * from reporting_grants where user_id=? and catalogue_version=? and revoked_at is null order by assigned_at,id",(rs,i)->view(rs),user,ReportingCatalogue.VERSION); }
    private Grant find(UUID user,UUID id,boolean lock) {
        var found=jdbc.query("select * from reporting_grants where id=? and user_id=?"+(lock?" for update":""),(rs,i)->view(rs),id,user);
        if(found.isEmpty()) throw ApplicationFailure.missing(); return found.getFirst();
    }
    private Grant view(ResultSet rs) throws java.sql.SQLException {
        return new Grant(rs.getObject("id",UUID.class),rs.getObject("user_id",UUID.class),rs.getString("scope"),rs.getString("region_code"),rs.getString("catalogue_version"),rs.getLong("version"),rs.getObject("assigned_at",OffsetDateTime.class),rs.getObject("revoked_at",OffsetDateTime.class));
    }
}
