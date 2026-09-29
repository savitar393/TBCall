package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.PatientUserLink;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface PatientUserLinkRepository extends JpaRepository<PatientUserLink, UUID> {
    List<PatientUserLink> findByPatient_Id(UUID patientId);
    List<PatientUserLink> findByUser_Id(UUID userId);
}
