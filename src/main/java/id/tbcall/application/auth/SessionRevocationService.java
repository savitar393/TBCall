package id.tbcall.application.auth;

import id.tbcall.persistence.entity.UserSession;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class SessionRevocationService {
    private final EntityManager em;
    private final Clock clock;
    public SessionRevocationService(EntityManager em, Clock clock) { this.em=em; this.clock=clock; }
    public void revokeAll(UUID user) {
        OffsetDateTime now=OffsetDateTime.now(clock);
        em.createQuery("select s from UserSession s where s.user.id=:user and s.revokedAt is null",UserSession.class)
                .setParameter("user",user).getResultList().forEach(session -> session.setRevokedAt(now));
    }
}
