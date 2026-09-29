package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.TBRegistration;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface TBRegistrationRepository extends JpaRepository<TBRegistration, UUID> {
    List<TBRegistration> findByPatient_IdOrderByRegistrationDateAsc(UUID patientId);
}
