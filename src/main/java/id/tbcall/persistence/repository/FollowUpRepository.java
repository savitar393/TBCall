package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.FollowUp;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface FollowUpRepository extends JpaRepository<FollowUp, UUID> {
    List<FollowUp> findByTreatment_Id(UUID treatmentId);
}
