package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface AlertRepository extends JpaRepository<Alert, UUID> {
}
