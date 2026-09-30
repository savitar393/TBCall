package id.tbcall.application.identity;

import id.tbcall.application.common.AuditService;
import id.tbcall.persistence.entity.Role;
import id.tbcall.persistence.entity.User;
import id.tbcall.persistence.entity.UserRole;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Caller serializes role lifecycle by locking the target User in the same transaction. */
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class RoleAssignments {
    private final EntityManager em;
    private final AuditService audit;
    private final Clock clock;
    public RoleAssignments(EntityManager em, AuditService audit, Clock clock) { this.em=em; this.audit=audit; this.clock=clock; }
    public void assign(User user, String code, UUID actor) {
        Role role=em.createQuery("select r from Role r where r.code=:code", Role.class).setParameter("code", code).getSingleResult();
        UserRole.Key key=new UserRole.Key(); key.userId=user.getId(); key.roleId=role.getId();
        if (em.find(UserRole.class, key)==null) {
            UserRole assignment=new UserRole(); assignment.setUserId(user.getId()); assignment.setRoleId(role.getId());
            assignment.setAssignedAt(OffsetDateTime.now(clock)); assignment.setAssignedBy(em.getReference(User.class, actor));
            em.persist(assignment); audit.record(actor, "ROLE_ASSIGNED", "USER", user.getId());
        }
    }
    public void remove(User user, String code, UUID actor) {
        var assignments=em.createQuery("select ur from UserRole ur where ur.userId=:user and ur.role.code=:code", UserRole.class)
                .setParameter("user", user.getId()).setParameter("code", code).getResultList();
        if (!assignments.isEmpty()) {
            assignments.forEach(em::remove); audit.record(actor, "ROLE_REMOVED", "USER", user.getId());
        }
    }
}
