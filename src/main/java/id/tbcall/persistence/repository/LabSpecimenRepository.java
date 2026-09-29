package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.LabSpecimen;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface LabSpecimenRepository extends JpaRepository<LabSpecimen, UUID> {
    List<LabSpecimen> findByLabRequest_Id(UUID requestId);
}
