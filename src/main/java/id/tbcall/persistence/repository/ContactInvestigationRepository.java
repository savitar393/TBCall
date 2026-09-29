package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.ContactInvestigation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface ContactInvestigationRepository extends JpaRepository<ContactInvestigation, UUID> {
    List<ContactInvestigation> findByContact_Id(UUID contactId);
}
