package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.SyncRun;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface SyncRunRepository extends JpaRepository<SyncRun, UUID> {
}
