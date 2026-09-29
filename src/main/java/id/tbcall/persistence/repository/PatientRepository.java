package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Patient;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PatientRepository extends JpaRepository<Patient, UUID> {
}
