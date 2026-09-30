package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.CaseConditionObservation;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseConditionObservationRepository extends JpaRepository<CaseConditionObservation, UUID> {
    List<CaseConditionObservation> findByTbCase_IdOrderByObservedAtAsc(UUID caseId);
}
