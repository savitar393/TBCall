package id.tbcall.application.auth;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.User;
import id.tbcall.persistence.entity.UserVerificationToken;
import id.tbcall.security.SecretTokens;
import id.tbcall.security.SecurityProperties;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** All token mutations lock the user first, then token rows, in the caller's transaction. */
@Component
@Transactional(propagation=Propagation.MANDATORY)
public class VerificationTokens {
    private final EntityManager em;
    private final SecretTokens secrets;
    private final SecurityProperties properties;
    private final VerificationDeliveryPort delivery;
    private final Clock clock;
    public VerificationTokens(EntityManager em, SecretTokens secrets, SecurityProperties properties,
            VerificationDeliveryPort delivery, Clock clock) {
        this.em=em; this.secrets=secrets; this.properties=properties; this.delivery=delivery; this.clock=clock;
    }
    public void requireDelivery() {
        if (!delivery.isAvailable()) throw unavailable();
    }
    public void requireRegistrationDelivery() {
        if (!delivery.isRegistrationAvailable()) throw unavailable();
    }
    public static ApplicationFailure unavailable() {
        return new ApplicationFailure(503, "VERIFICATION_DELIVERY_UNAVAILABLE", "Pengiriman verifikasi belum tersedia",
                "Pengiriman email atau SMS belum dikonfigurasi. Hubungi administrator.");
    }
    public String issue(User user, String purpose, String destination) {
        String secret=secrets.generate();
        OffsetDateTime expiry=OffsetDateTime.now(clock).plus(properties.getVerificationLifetime());
        UserVerificationToken token=new UserVerificationToken(); token.setUser(user); token.setPurpose(purpose);
        token.setTokenHash(secrets.hash(secret)); token.setExpiresAt(expiry); em.persist(token);
        delivery.deliver(purpose, destination, secret, expiry);
        return secret;
    }
    public void invalidate(User user, String purpose) {
        OffsetDateTime now=OffsetDateTime.now(clock);
        em.createQuery("select t from UserVerificationToken t where t.user.id=:user and t.purpose=:purpose and t.usedAt is null",
                UserVerificationToken.class).setParameter("user", user.getId()).setParameter("purpose", purpose)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList().forEach(t -> t.setUsedAt(now));
        em.flush();
    }
    public UserVerificationToken lockForConsumption(String secret, ApplicationFailure invalid) {
        if (secret==null || secret.length()!=43) throw invalid;
        String hash=secrets.hash(secret);
        // Scalar lookup avoids retaining a stale token entity while waiting for a concurrent resend.
        var owners=em.createQuery("select t.user.id from UserVerificationToken t where t.tokenHash=:hash", UUID.class)
                .setParameter("hash", hash).getResultList();
        if (owners.isEmpty()) throw invalid;
        em.find(User.class, owners.getFirst(), LockModeType.PESSIMISTIC_WRITE);
        var found=em.createQuery("select t from UserVerificationToken t where t.tokenHash=:hash", UserVerificationToken.class)
                .setParameter("hash", hash).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        if (found.isEmpty()) throw invalid;
        UserVerificationToken token=found.getFirst();
        if (token.getUsedAt()!=null || !token.getExpiresAt().isAfter(OffsetDateTime.now(clock))) throw invalid;
        return token;
    }
}
