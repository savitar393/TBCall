package id.tbcall.application.auth;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.AuthorizationResolver;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.User;
import id.tbcall.persistence.entity.UserSession;
import id.tbcall.security.IdentityNormalizer;
import id.tbcall.security.PasswordHasher;
import id.tbcall.security.SecretTokens;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.auth.AuthDtos.*;

@Service
public class SessionService {
    private final EntityManager em;
    private final PasswordHasher passwords;
    private final SecretTokens tokens;
    private final AuditService audit;
    private final AuthorizationResolver resolver;
    private final Clock clock;
    public SessionService(EntityManager em, PasswordHasher passwords, SecretTokens tokens, AuditService audit,
            AuthorizationResolver resolver, Clock clock) {
        this.em=em; this.passwords=passwords; this.tokens=tokens; this.audit=audit; this.resolver=resolver; this.clock=clock;
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public IssuedSession login(LoginRequest input) {
        String identity;
        try { identity=IdentityNormalizer.login(input.identity()); } catch (ApplicationFailure invalid) { identity="invalid"; }
        List<User> found = em.createQuery("select u from User u where u.email=:identity or u.phone=:identity", User.class)
                .setParameter("identity", identity).getResultList();
        User user = found.isEmpty() ? null : found.getFirst();
        boolean correct = passwords.matches(input.password(), user==null ? null : user.getPasswordHash());
        boolean verified = user != null && ((identity.equals(user.getEmail()) && user.getEmailVerifiedAt()!=null)
                || (identity.equals(user.getPhone()) && user.getPhoneVerifiedAt()!=null));
        if (!correct || user==null || !"ACTIVE".equals(user.getStatus()) || !verified)
            throw new ApplicationFailure(401, "INVALID_CREDENTIALS", "Login gagal", "Identitas atau kata sandi tidak valid.");
        OffsetDateTime now = OffsetDateTime.now(clock); String secret=tokens.generate();
        UserSession session=new UserSession(); session.setUser(user); session.setTokenHash(tokens.hash(secret));
        session.setExpiresAt(now.plusHours(8)); em.persist(session); user.setLastLoginAt(now);
        audit.record(user.getId(), "LOGIN_SUCCESS", "USER", user.getId()); em.flush();
        return new IssuedSession(new LoginResponse(user.getId(), user.getStatus(), session.getExpiresAt()), secret);
    }
    @Transactional(readOnly=true)
    public Optional<CurrentActor> resolve(String secret) {
        if (secret==null || secret.length()!=43) return Optional.empty();
        List<UserSession> found=em.createQuery("""
                select s from UserSession s join fetch s.user u where s.tokenHash=:hash and s.revokedAt is null
                and s.expiresAt>:now and u.status='ACTIVE'
                """, UserSession.class).setParameter("hash", tokens.hash(secret)).setParameter("now", OffsetDateTime.now(clock)).getResultList();
        return found.isEmpty() ? Optional.empty() : Optional.of(resolver.resolve(found.getFirst().getUser(), found.getFirst().getId()));
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void logout(CurrentActor actor) {
        UserSession session=em.find(UserSession.class, actor.sessionId());
        if (session!=null && session.getUser().getId().equals(actor.userId()) && session.getRevokedAt()==null) {
            session.setRevokedAt(OffsetDateTime.now(clock));
            audit.record(actor.userId(), "LOGOUT", "USER", actor.userId());
        }
    }
}
