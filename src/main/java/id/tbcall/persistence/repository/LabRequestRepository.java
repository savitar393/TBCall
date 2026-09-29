package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.LabRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface LabRequestRepository extends JpaRepository<LabRequest, UUID> {
    List<LabRequest> findByRegistration_Id(UUID registrationId);
    List<LabRequest> findByTbCase_Id(UUID caseId);
}
