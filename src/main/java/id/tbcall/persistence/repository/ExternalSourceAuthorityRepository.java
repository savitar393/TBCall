package id.tbcall.persistence.repository;

import id.tbcall.persistence.entity.ExternalSourceAuthority;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalSourceAuthorityRepository extends JpaRepository<ExternalSourceAuthority, UUID> {}
