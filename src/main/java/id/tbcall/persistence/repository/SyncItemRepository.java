package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.SyncItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface SyncItemRepository extends JpaRepository<SyncItem, UUID> {
}
