package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.ExternalIdentifier;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.Optional;

public interface ExternalIdentifierRepository extends JpaRepository<ExternalIdentifier, UUID> {
    Optional<ExternalIdentifier> findByExternalSystem_IdAndEntityTypeAndExternalId(UUID systemId, String entityType, String externalId);
}
