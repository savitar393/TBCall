package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Contact;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface ContactRepository extends JpaRepository<Contact, UUID> {
    List<Contact> findByIndexCase_Id(UUID caseId);
}
