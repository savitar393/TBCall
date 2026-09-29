package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.LabRequestTest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface LabRequestTestRepository extends JpaRepository<LabRequestTest, UUID> {
    List<LabRequestTest> findByLabRequest_Id(UUID requestId);
}
