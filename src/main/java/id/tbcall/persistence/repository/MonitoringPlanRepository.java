package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.MonitoringPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface MonitoringPlanRepository extends JpaRepository<MonitoringPlan, UUID> {
}
