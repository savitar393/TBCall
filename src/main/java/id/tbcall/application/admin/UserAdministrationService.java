package id.tbcall.application.admin;

import id.tbcall.application.auth.SessionRevocationService;
import id.tbcall.application.common.*;
import id.tbcall.application.identity.RoleAssignments;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.User;
import id.tbcall.web.IfMatch;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.admin.AdminDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class UserAdministrationService {
    public static final Set<String> ADMIN_MANAGED=Set.of("SYSTEM_ADMIN","PROGRAM_MONITOR","TB_OFFICER","LAB_STAFF","FACILITY_ADMIN");
    private static final Set<String> OPERATIONAL=Set.of("TB_OFFICER","LAB_STAFF","FACILITY_ADMIN");
    private final EntityManager em;
    private final AdministrativePolicies policies;
    private final AdministrativeUsers users;
    private final SystemAdminGuard guard;
    private final RoleAssignments roles;
    private final SessionRevocationService sessions;
    private final AuditService audit;
    public UserAdministrationService(EntityManager em, AdministrativePolicies policies, AdministrativeUsers users,
            SystemAdminGuard guard, RoleAssignments roles, SessionRevocationService sessions, AuditService audit) {
        this.em=em; this.policies=policies; this.users=users; this.guard=guard; this.roles=roles; this.sessions=sessions; this.audit=audit;
    }
    public RoleResponse assignRole(CurrentActor actor, UUID id, String roleCode) {
        policies.requireSystem(actor,"ROLE_MANAGE"); allowedRole(roleCode); guard.lockCatalog(); User user=users.activeVerified(id);
        if(OPERATIONAL.contains(roleCode)) {
            long count=em.createQuery("select count(uf) from UserFacility uf where uf.userId=:user and uf.active=true and uf.facility.active=true",Long.class)
                    .setParameter("user",id).getSingleResult();
            if(count==0) throw ApplicationFailure.conflict("Peran operasional memerlukan minimal satu penugasan fasyankes aktif.");
        }
        roles.assign(user,roleCode,actor.userId()); em.flush(); return new RoleResponse(id,roleCode,true);
    }
    public RoleResponse removeRole(CurrentActor actor, UUID id, String roleCode) {
        policies.requireSystem(actor,"ROLE_MANAGE"); allowedRole(roleCode); guard.lockCatalog(); User user=users.activeVerified(id);
        if("SYSTEM_ADMIN".equals(roleCode) && guard.assigned(id)) guard.requireOtherUsable(user);
        roles.remove(user,roleCode,actor.userId()); em.flush(); return new RoleResponse(id,roleCode,false);
    }
    public StatusResponse suspend(CurrentActor actor, UUID id, String match) { return status(actor,id,match,"SUSPENDED","USER_SUSPENDED"); }
    public StatusResponse reactivate(CurrentActor actor, UUID id, String match) { return status(actor,id,match,"ACTIVE","USER_REACTIVATED"); }
    public StatusResponse disable(CurrentActor actor, UUID id, String match) { return status(actor,id,match,"DISABLED","USER_DISABLED"); }
    private StatusResponse status(CurrentActor actor, UUID id, String match, String next, String action) {
        policies.requireSystem(actor,"USER_ACCOUNT_MANAGE"); guard.lockCatalog(); User user=users.lock(id); IfMatch.require(match,user.getVersion());
        boolean valid=switch(next) {
            case "SUSPENDED" -> "ACTIVE".equals(user.getStatus());
            case "ACTIVE" -> "SUSPENDED".equals(user.getStatus());
            default -> Set.of("ACTIVE","SUSPENDED").contains(user.getStatus());
        };
        if(!valid) throw ApplicationFailure.conflict("Perubahan status akun tidak diizinkan.");
        if("ACTIVE".equals(next) && !AdministrativeUsers.verified(user)) throw ApplicationFailure.invalid("Akun harus memiliki identitas login terverifikasi sebelum diaktifkan kembali.");
        if(!"ACTIVE".equals(next) && guard.assigned(id)) guard.requireOtherUsable(user);
        user.setStatus(next); if(!"ACTIVE".equals(next)) sessions.revokeAll(id);
        audit.record(actor.userId(),action,"USER",id); em.flush(); return new StatusResponse(id,next,user.getVersion());
    }
    private void allowedRole(String code) {
        if(!ADMIN_MANAGED.contains(code)) throw ApplicationFailure.invalid("Peran tidak dapat diubah melalui administrasi global.");
    }
}
