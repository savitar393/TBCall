package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Referral;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface ReferralRepository extends JpaRepository<Referral, UUID> {
    List<Referral> findByTbCase_Id(UUID caseId);
}
