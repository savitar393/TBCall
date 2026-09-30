package id.tbcall.application.auth;

import id.tbcall.application.common.AuditService;
import id.tbcall.application.identity.RoleAssignments;
import id.tbcall.persistence.entity.Role;
import id.tbcall.persistence.entity.User;
import id.tbcall.security.IdentityNormalizer;
import id.tbcall.security.PasswordHasher;
import id.tbcall.security.SecurityProperties;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BootstrapAdmin {
    private final EntityManager em;
    private final SecurityProperties properties;
    private final PasswordHasher passwords;
    private final RoleAssignments roles;
    private final AuditService audit;
    private final Clock clock;
    public BootstrapAdmin(EntityManager em, SecurityProperties properties, PasswordHasher passwords,
            RoleAssignments roles, AuditService audit, Clock clock) {
        this.em=em; this.properties=properties; this.passwords=passwords; this.roles=roles; this.audit=audit; this.clock=clock;
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void initialize() {
        String email=properties.getBootstrapEmail(), phone=properties.getBootstrapPhone(), password=properties.getBootstrapPassword();
        boolean identity=(email!=null && !email.isBlank()) || (phone!=null && !phone.isBlank());
        if (!identity && (password==null || password.isBlank())) return;
        // A migration-managed role row serializes first-admin creation across application instances.
        Role admin=em.createQuery("select r from Role r where r.code='SYSTEM_ADMIN'", Role.class)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).getSingleResult();
        if (em.createQuery("select count(ur) from UserRole ur where ur.roleId=:role", Long.class)
                .setParameter("role", admin.getId()).getSingleResult()>0) return;
        if (!identity || password==null || password.length()<12 || password.length()>128)
            throw new IllegalStateException("Bootstrap requires an explicit identity and a 12–128 character password");
        email=IdentityNormalizer.email(email); phone=IdentityNormalizer.phone(phone);
        if (em.createQuery("select count(u) from User u where u.email=:email or u.phone=:phone", Long.class)
                .setParameter("email", email).setParameter("phone", phone).getSingleResult()>0)
            throw new IllegalStateException("Bootstrap identity already belongs to an account; explicit administration is required");
        User user=new User(); user.setEmail(email); user.setPhone(phone); user.setPasswordHash(passwords.encode(password)); user.setStatus("ACTIVE");
        OffsetDateTime now=OffsetDateTime.now(clock); if (email!=null) user.setEmailVerifiedAt(now); if (phone!=null) user.setPhoneVerifiedAt(now);
        em.persist(user); roles.assign(user, "SYSTEM_ADMIN", user.getId());
        audit.record(user.getId(), "BOOTSTRAP_ADMIN_CREATED", "USER", user.getId()); em.flush();
    }
}
