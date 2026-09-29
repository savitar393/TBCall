package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.Facility;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface FacilityRepository extends JpaRepository<Facility, UUID> {
}
