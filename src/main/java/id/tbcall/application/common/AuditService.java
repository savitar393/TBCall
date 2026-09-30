package id.tbcall.application.common;

import id.tbcall.persistence.entity.AuditLog;
import id.tbcall.persistence.entity.User;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {
    private final EntityManager em;
    private final Clock clock;
    public AuditService(EntityManager em, Clock clock) { this.em = em; this.clock = clock; }
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID actor, String action, String entityType, UUID entityId) {
        AuditLog log = new AuditLog();
        if (actor != null) log.setActorUser(em.getReference(User.class, actor));
        log.setAction(action); log.setEntityType(entityType); log.setEntityId(entityId);
        log.setOccurredAt(OffsetDateTime.now(clock));
        log.setRequestId(MDC.get("traceId") == null ? UUID.randomUUID().toString() : MDC.get("traceId"));
        // An allowlisted correlation value only: no request bodies, credentials or clinical fields.
        log.setMetadata(Map.of("traceId", log.getRequestId()));
        em.persist(log);
    }
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void authorizationDenied(UUID actor) { record(actor, "AUTHORIZATION_DENIED", "IDENTITY_LINK", null); }
}
