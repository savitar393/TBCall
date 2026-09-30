package id.tbcall.application.auth;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.persistence.entity.User;
import id.tbcall.security.IdentityNormalizer;
import id.tbcall.security.PasswordHasher;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.auth.AuthDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class AccountRecoveryService {
    private final EntityManager em;
    private final VerificationTokens tokens;
    private final PasswordHasher passwords;
    private final SessionRevocationService sessions;
    private final AuditService audit;
    private final Clock clock;
    public AccountRecoveryService(EntityManager em, VerificationTokens tokens, PasswordHasher passwords,
            SessionRevocationService sessions, AuditService audit, Clock clock) {
        this.em=em; this.tokens=tokens; this.passwords=passwords; this.sessions=sessions; this.audit=audit; this.clock=clock;
    }
    public RecoveryResponse resend(String input) {
        tokens.requireDelivery();
        String identity=IdentityNormalizer.login(input);
        User user=find(identity);
        if (user!=null && ("PENDING".equals(user.getStatus()) || "ACTIVE".equals(user.getStatus())) && !verified(user, identity)) {
            String purpose=identity.contains("@") ? "EMAIL_VERIFICATION" : "PHONE_VERIFICATION";
            tokens.invalidate(user, purpose); tokens.issue(user, purpose, identity);
            audit.record(user.getId(), "VERIFICATION_RESENT", "USER", user.getId());
        }
        return accepted();
    }
    public RecoveryResponse requestReset(String input) {
        tokens.requireDelivery();
        String identity=IdentityNormalizer.login(input);
        User user=find(identity);
        if (user!=null && "ACTIVE".equals(user.getStatus()) && verified(user, identity)) {
            tokens.invalidate(user, "PASSWORD_RESET"); tokens.issue(user, "PASSWORD_RESET", identity);
            audit.record(user.getId(), "PASSWORD_RESET_REQUESTED", "USER", user.getId());
        }
        return accepted();
    }
    public void confirmReset(ResetConfirmRequest request) {
        ApplicationFailure invalid=new ApplicationFailure(400, "PASSWORD_RESET_TOKEN_INVALID", "Pemulihan gagal",
                "Token tidak valid, kedaluwarsa, atau sudah digunakan.");
        var token=tokens.lockForConsumption(request.token(), invalid);
        User user=token.getUser();
        if (!"PASSWORD_RESET".equals(token.getPurpose()) || !"ACTIVE".equals(user.getStatus())
                || !((user.getEmail()!=null && user.getEmailVerifiedAt()!=null) || (user.getPhone()!=null && user.getPhoneVerifiedAt()!=null))) throw invalid;
        user.setPasswordHash(passwords.encode(request.newPassword()));
        token.setUsedAt(OffsetDateTime.now(clock)); sessions.revokeAll(user.getId());
        audit.record(user.getId(), "PASSWORD_RESET_COMPLETED", "USER", user.getId()); em.flush();
    }
    private User find(String identity) {
        var found=em.createQuery("select u from User u where " + (identity.contains("@") ? "u.email" : "u.phone") + "=:identity", User.class)
                .setParameter("identity", identity).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        return found.isEmpty() ? null : found.getFirst();
    }
    private boolean verified(User user, String identity) {
        return identity.contains("@") ? user.getEmailVerifiedAt()!=null : user.getPhoneVerifiedAt()!=null;
    }
    private RecoveryResponse accepted() {
        return new RecoveryResponse("Jika identitas memenuhi syarat, instruksi akan dikirimkan. Periksa email atau SMS Anda.");
    }
}
