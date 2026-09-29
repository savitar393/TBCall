package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "adverse_events")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class AdverseEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "treatment_id")
    private Treatment treatment;

    @Column(name = "reported_at")
    private OffsetDateTime reportedAt;

    @Column(name = "event_type", length = 150)
    private String eventType;

    @Column(name = "severity", length = 50)
    private String severity;

    @Column(name = "serious")
    private Boolean serious;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "ended_at")
    private OffsetDateTime endedAt;

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @Column(name = "action_taken", columnDefinition = "text")
    private String actionTaken;

    @Column(name = "outcome", columnDefinition = "text")
    private String outcome;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
