package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
}
