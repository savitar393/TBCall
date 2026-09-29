package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.MonitoringEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface MonitoringEventRepository extends JpaRepository<MonitoringEvent, UUID> {
}
