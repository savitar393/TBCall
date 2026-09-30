package id.tbcall.application.admin;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.Role;
import id.tbcall.persistence.entity.User;
import jakarta.persistence.*;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class SystemAdminGuard {
    private final EntityManager em;
    public SystemAdminGuard(EntityManager em) { this.em=em; }
    public void lockCatalog() {
        // Shared with first-admin bootstrap; take this lock before any target-user lock.
        em.createQuery("select r from Role r where r.code='SYSTEM_ADMIN'",Role.class).setLockMode(LockModeType.PESSIMISTIC_WRITE).getSingleResult();
    }
    public boolean assigned(UUID user) {
        return em.createQuery("select count(ur) from UserRole ur where ur.userId=:user and ur.role.code='SYSTEM_ADMIN'",Long.class)
                .setParameter("user",user).getSingleResult()>0;
    }
    public void requireOtherUsable(User affected) {
        long others=em.createQuery("""
                select count(ur) from UserRole ur where ur.role.code='SYSTEM_ADMIN' and ur.userId<>:user
                and ur.user.status='ACTIVE' and ((ur.user.email is not null and ur.user.emailVerifiedAt is not null)
                or (ur.user.phone is not null and ur.user.phoneVerifiedAt is not null))
                """,Long.class).setParameter("user",affected.getId()).getSingleResult();
        if(others==0) throw ApplicationFailure.conflict("Minimal satu administrator sistem aktif dan terverifikasi harus tetap tersedia.");
    }
}
