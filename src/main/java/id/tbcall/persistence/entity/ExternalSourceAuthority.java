package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "external_source_authorities")
@DynamicInsert
@Getter @Setter @NoArgsConstructor
public class ExternalSourceAuthority {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "external_system_id", nullable = false)
    private ExternalSystem externalSystem;
    @Column(name = "entity_type", nullable = false, length = 80)
    private String entityType;
    @Column(name = "entity_id", nullable = false)
    private UUID entityId;
    @Column(name = "authority_scope", nullable = false, length = 80)
    private String authorityScope;
    @Column(name = "external_id", length = 255)
    private String externalId;
    @Column(name = "source_version", length = 100)
    private String sourceVersion;
    @Column(name = "effective_at", nullable = false)
    private OffsetDateTime effectiveAt;
    @Column(name = "released_at")
    private OffsetDateTime releasedAt;
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
