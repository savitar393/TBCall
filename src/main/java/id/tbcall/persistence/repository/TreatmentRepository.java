package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Treatment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface TreatmentRepository extends JpaRepository<Treatment, UUID> {
    List<Treatment> findByTbCase_Id(UUID caseId);
}
