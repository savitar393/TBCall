package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.DoseEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface DoseEventRepository extends JpaRepository<DoseEvent, UUID> {
    List<DoseEvent> findByTreatment_Id(UUID treatmentId);
}
