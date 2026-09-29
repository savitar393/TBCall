package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Drug;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface DrugRepository extends JpaRepository<Drug, UUID> {
}
