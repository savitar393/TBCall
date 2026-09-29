package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.PreventiveTreatment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface PreventiveTreatmentRepository extends JpaRepository<PreventiveTreatment, UUID> {
    List<PreventiveTreatment> findByContact_Id(UUID contactId);
}
