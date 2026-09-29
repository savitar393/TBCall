package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Diagnosis;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface DiagnosisRepository extends JpaRepository<Diagnosis, UUID> {
    List<Diagnosis> findByRegistration_Id(UUID registrationId);
}
