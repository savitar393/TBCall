package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.TreatmentOutcome;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.Optional;

public interface TreatmentOutcomeRepository extends JpaRepository<TreatmentOutcome, UUID> {
    Optional<TreatmentOutcome> findByTreatment_Id(UUID treatmentId);
}
