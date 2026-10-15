package id.tbcall.application.reporting;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.reporting.ReportingDtos.*;

@Component @Transactional(propagation=Propagation.MANDATORY)
public class ReportingAccess {
    private final JdbcTemplate jdbc; private final ReportingCatalogue catalogue; private final AuditService audit;
    public ReportingAccess(JdbcTemplate jdbc,ReportingCatalogue catalogue,AuditService audit) {
        this.jdbc=jdbc; this.catalogue=catalogue; this.audit=audit;
    }
    // Recheck live grants/roles/permissions instead of extending CurrentActor's clinical facility scope.
    public void admin(CurrentActor actor,String permission) { require(actor,"SYSTEM_ADMIN",permission); }
    /**
     * Match account/role administration's user lock before checking live eligibility.
     * Shared locks also keep authorization valid while waiting on a grant/publication.
     * Denial audits use FK KEY SHARE, which is compatible with these locks.
     */
    public void require(CurrentActor actor,String role,String permission) {
        if(actor==null) denied(null);
        jdbc.queryForList("select id from users where id=? for share",actor.userId());
        jdbc.queryForList("""
                select rp.role_id,rp.permission_id from role_permissions rp
                join user_roles ur on ur.role_id=rp.role_id join permissions p on p.id=rp.permission_id
                where ur.user_id=? and p.code=? order by rp.role_id,rp.permission_id
                limit 1 for share of rp
                """,actor.userId(),permission);
        if(actor==null || !Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from users u where u.id=? and u.status='ACTIVE'
                and (u.email_verified_at is not null or u.phone_verified_at is not null)
                and exists(select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=u.id and r.code=?)
                and exists(select 1 from user_roles ur join role_permissions rp on rp.role_id=ur.role_id
                    join permissions p on p.id=rp.permission_id where ur.user_id=u.id and p.code=?))
                """,Boolean.class,actor.userId(),role,permission))) denied(actor);
    }
    /** Same Java UUID ordering as existing identity-link operations, never PostgreSQL UUID order. */
    public void lockAdministrationUsers(CurrentActor actor,UUID target) {
        if(actor==null) denied(null);
        for(UUID id:new TreeSet<>(List.of(actor.userId(),target)))
            jdbc.queryForList("select id from users where id=? for no key update",id);
    }
    public Geography readScope(CurrentActor actor,String scope,String code) {
        require(actor,"PROGRAM_MONITOR","REPORT_READ");
        var grants=jdbc.queryForList("""
                select scope,region_code from reporting_grants where user_id=? and catalogue_version=?
                and revoked_at is null order by id for share
                """,actor.userId(),ReportingCatalogue.VERSION);
        if(grants.isEmpty()) denied(actor);
        catalogue.requireVerified();
        if(scope==null) {
            if(code!=null || grants.size()!=1) throw ApplicationFailure.invalid("Pilih satu lingkup pelaporan yang ditugaskan.");
            scope=(String)grants.getFirst().get("scope"); code=(String)grants.getFirst().get("region_code");
        }
        Geography target=catalogue.geography(scope,code);
        for(var grant:grants) {
            String assigned=(String)grant.get("scope"),region=(String)grant.get("region_code");
            if(assigned.equals("NATIONAL") || assigned.equals(target.scope()) && Objects.equals(region,target.code())) return target;
            if(assigned.equals("PROVINCE") && target.scope().equals("REGENCY") && Boolean.TRUE.equals(jdbc.queryForObject(
                    "select exists(select 1 from reporting_regions where catalogue_version=? and code=? and parent_code=?)",
                    Boolean.class,ReportingCatalogue.VERSION,target.code(),region))) return target;
        }
        denied(actor); throw ApplicationFailure.forbidden();
    }
    /** Own assignments only; an empty list is a verified absence of reporting access. */
    public Scopes ownScopes(CurrentActor actor) {
        require(actor,"PROGRAM_MONITOR","REPORT_READ");
        var grants=jdbc.queryForList("""
                select scope,region_code from reporting_grants where user_id=? and catalogue_version=?
                and revoked_at is null order by id for share
                """,actor.userId(),ReportingCatalogue.VERSION);
        catalogue.requireVerified();
        return new Scopes(ReportingCatalogue.VERSION,grants.stream().map(g ->
                catalogue.geography((String)g.get("scope"),(String)g.get("region_code"))).toList());
    }
    private void denied(CurrentActor actor) {
        audit.reportingDenied(actor==null?null:actor.userId(),"REPORT_ACCESS_DENIED",null);
        throw ApplicationFailure.forbidden();
    }
}
