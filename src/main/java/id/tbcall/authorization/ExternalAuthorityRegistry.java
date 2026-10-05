package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.ExternalSourceAuthority;
import jakarta.persistence.EntityManager;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Explicit TBCall source ownership, independent of identifiers and connector activation. */
@Component
@Transactional(readOnly = true, isolation = Isolation.READ_COMMITTED)
public class ExternalAuthorityRegistry {
    private static final Set<String> SCOPES = Set.of("CLINICAL", "LABORATORY", "REFERRAL", "CONTACT_TPT", "MONITORING");
    private final EntityManager em;

    public ExternalAuthorityRegistry(EntityManager em) { this.em = em; }

    public record AuthorityDescriptor(UUID id, UUID externalSystemId, String entityType, UUID entityId,
            String authorityScope, String externalId, String sourceVersion, OffsetDateTime effectiveAt) {}

    public boolean isExternallyAuthoritative(String entityType, UUID entityId, String authorityScope) {
        return activeAuthority(entityType, entityId, authorityScope).isPresent();
    }

    public Optional<AuthorityDescriptor> activeAuthority(String entityType, UUID entityId, String authorityScope) {
        if (!SCOPES.contains(authorityScope)) throw new IllegalArgumentException("Unsupported TBCall authority scope");
        if (entityId == null) return Optional.empty();
        return em.createQuery("""
                select a from ExternalSourceAuthority a
                where a.entityType=:type and a.entityId=:id and a.authorityScope=:scope and a.releasedAt is null
                """, ExternalSourceAuthority.class)
                .setParameter("type", entityType).setParameter("id", entityId).setParameter("scope", authorityScope)
                .setMaxResults(1).getResultList().stream().findFirst()
                .map(a -> new AuthorityDescriptor(a.getId(), a.getExternalSystem().getId(), a.getEntityType(),
                        a.getEntityId(), a.getAuthorityScope(), a.getExternalId(), a.getSourceVersion(), a.getEffectiveAt()));
    }

    public void requireLocallyWritable(String entityType, UUID entityId, String authorityScope) {
        if (isExternallyAuthoritative(entityType, entityId, authorityScope)) {
            throw new ApplicationFailure(409, "SOURCE_AUTHORITY_CONFLICT", "Sumber data tidak mengizinkan perubahan lokal",
                    "Data ini dikendalikan oleh sumber eksternal yang berwenang. Perubahan harus direkonsiliasi melalui alur integrasi yang disetujui.");
        }
    }
}
