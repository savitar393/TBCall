package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "sync_items")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class SyncItem {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sync_run_id")
    private SyncRun syncRun;

    @Column(name = "entity_type", length = 80)
    private String entityType;

    @Column(name = "external_id", length = 255)
    private String externalId;

    @Column(name = "resolved_entity_id")
    private UUID resolvedEntityId;

    @Column(name = "operation", length = 30)
    private String operation;

    @Column(name = "status", length = 30)
    private String status;

    @Column(name = "source_updated_at")
    private OffsetDateTime sourceUpdatedAt;

    @Column(name = "content_hash", length = 128)
    private String contentHash;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_payload", columnDefinition = "jsonb")
    private Map<String, Object> rawPayload;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "processed_at")
    private OffsetDateTime processedAt;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
