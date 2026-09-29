package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Regimen;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface RegimenRepository extends JpaRepository<Regimen, UUID> {
}
