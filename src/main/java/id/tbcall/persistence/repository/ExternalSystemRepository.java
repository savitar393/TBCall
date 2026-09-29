package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.ExternalSystem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ExternalSystemRepository extends JpaRepository<ExternalSystem, UUID> {
}
