package id.tbcall.application.auth;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.persistence.entity.User;
import id.tbcall.persistence.entity.UserVerificationToken;
import id.tbcall.security.IdentityNormalizer;
import id.tbcall.security.PasswordHasher;
import id.tbcall.security.SecurityProperties;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.auth.AuthDtos.*;

@Service
public class AuthService {
    private final EntityManager em;
    private final PasswordHasher passwords;
    private final VerificationTokens tokens;
    private final SecurityProperties properties;
    private final AuditService audit;
    private final Clock clock;
    public AuthService(EntityManager em, PasswordHasher passwords, VerificationTokens tokens, SecurityProperties properties,
            AuditService audit, Clock clock) {
        this.em=em; this.passwords=passwords; this.tokens=tokens; this.properties=properties;
        this.audit=audit; this.clock=clock;
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public RegistrationResponse register(RegisterRequest input) {
        tokens.requireRegistrationDelivery();
        String email = IdentityNormalizer.email(input.email()); String phone = IdentityNormalizer.phone(input.phone());
        if (email == null && phone == null) throw ApplicationFailure.invalid("Email atau nomor telepon wajib diisi.");
        if (input.password() == null || input.password().length()<12 || input.password().length()>128)
            throw ApplicationFailure.invalid("Kata sandi harus berisi 12–128 karakter.");
        long existing = em.createQuery("select count(u) from User u where u.email=:email or u.phone=:phone", Long.class)
                .setParameter("email", email).setParameter("phone", phone).getSingleResult();
        if (existing > 0) throw new ApplicationFailure(409, "LOGIN_IDENTITY_EXISTS", "Identitas sudah terdaftar", "Email atau nomor telepon sudah digunakan.");
        User user = new User(); user.setEmail(email); user.setPhone(phone); user.setPasswordHash(passwords.encode(input.password())); em.persist(user);
        List<VerificationSecret> secrets = new ArrayList<>();
        if (email != null) issue(user, "EMAIL_VERIFICATION", email, secrets);
        if (phone != null) issue(user, "PHONE_VERIFICATION", phone, secrets);
        audit.record(user.getId(), "USER_REGISTERED", "USER", user.getId());
        em.flush();
        return new RegistrationResponse(user.getId(), user.getStatus(), properties.isExposeVerificationTokens() ? List.copyOf(secrets) : List.of());
    }
    private void issue(User user, String purpose, String destination, List<VerificationSecret> secrets) {
        String secret = tokens.issue(user, purpose, destination);
        secrets.add(new VerificationSecret(purpose, secret));
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public VerificationResponse verify(String secret) {
        UserVerificationToken token = tokens.lockForConsumption(secret, invalidToken());
        OffsetDateTime now = OffsetDateTime.now(clock);
        User user = token.getUser();
        if (!List.of("PENDING", "ACTIVE").contains(user.getStatus())) throw invalidToken();
        if ("EMAIL_VERIFICATION".equals(token.getPurpose()) && user.getEmail()!=null) user.setEmailVerifiedAt(now);
        else if ("PHONE_VERIFICATION".equals(token.getPurpose()) && user.getPhone()!=null) user.setPhoneVerifiedAt(now);
        else throw invalidToken();
        token.setUsedAt(now);
        if ("PENDING".equals(user.getStatus())) user.setStatus("ACTIVE");
        audit.record(user.getId(), "CONTACT_VERIFIED", "USER", user.getId());
        em.flush(); return new VerificationResponse(user.getId(), user.getStatus());
    }
    private ApplicationFailure invalidToken() {
        return new ApplicationFailure(400, "VERIFICATION_TOKEN_INVALID", "Verifikasi gagal", "Token tidak valid, kedaluwarsa, atau sudah digunakan.");
    }
}
