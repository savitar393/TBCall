package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.IntegrationConflict;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IntegrationConflictRepository extends JpaRepository<IntegrationConflict, UUID> {}
