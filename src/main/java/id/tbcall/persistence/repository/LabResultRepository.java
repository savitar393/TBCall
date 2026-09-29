package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.LabResult;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface LabResultRepository extends JpaRepository<LabResult, UUID> {
    List<LabResult> findByLabRequestTest_IdOrderBySequenceNoAsc(UUID requestTestId);
}
