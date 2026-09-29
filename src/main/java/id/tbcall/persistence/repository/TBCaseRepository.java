package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.TBCase;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.Optional;

public interface TBCaseRepository extends JpaRepository<TBCase, UUID> {
    Optional<TBCase> findByRegistration_Id(UUID registrationId);
}
