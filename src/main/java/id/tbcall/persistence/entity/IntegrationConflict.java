package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "integration_conflicts")
@DynamicInsert
@Getter @Setter @NoArgsConstructor
public class IntegrationConflict {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "external_system_id", nullable = false)
    private ExternalSystem externalSystem;
    @Column(name = "entity_type", nullable = false, length = 80)
    private String entityType;
    @Column(name = "entity_id")
    private UUID entityId;
    @Column(name = "external_id", nullable = false, length = 255)
    private String externalId;
    @Column(name = "authority_scope", nullable = false, length = 80)
    private String authorityScope;
    @Column(name = "local_content_hash", length = 128)
    private String localContentHash;
    @Column(name = "source_content_hash", length = 128)
    private String sourceContentHash;
    @Column(name = "source_version", length = 100)
    private String sourceVersion;
    @Column(name = "status", nullable = false, length = 30)
    private String status = "OPEN";
    @Column(name = "first_seen_at", nullable = false)
    private OffsetDateTime firstSeenAt;
    @Column(name = "last_seen_at", nullable = false)
    private OffsetDateTime lastSeenAt;
    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;
    @Column(name = "resolution_note", columnDefinition = "text")
    private String resolutionNote;
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
