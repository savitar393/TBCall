package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "sync_runs")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class SyncRun {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "external_system_id")
    private ExternalSystem externalSystem;

    @Column(name = "direction", length = 20)
    private String direction = "INBOUND";

    @Column(name = "status", length = 30)
    private String status = "RUNNING";

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    @Column(name = "records_received")
    private Integer recordsReceived = 0;

    @Column(name = "records_created")
    private Integer recordsCreated = 0;

    @Column(name = "records_updated")
    private Integer recordsUpdated = 0;

    @Column(name = "records_failed")
    private Integer recordsFailed = 0;

    @Column(name = "cursor_value", columnDefinition = "text")
    private String cursorValue;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
