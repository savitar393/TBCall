package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.TreatmentDrug;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.List;

public interface TreatmentDrugRepository extends JpaRepository<TreatmentDrug, UUID> {
    List<TreatmentDrug> findByTreatment_Id(UUID treatmentId);
}
