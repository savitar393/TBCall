package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "case_condition_observations")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class CaseConditionObservation {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_id", nullable = false)
    private TBCase tbCase;

    @Column(name = "condition_type_code", length = 60, nullable = false)
    private String conditionTypeCode;

    @Column(name = "status_code", length = 20, nullable = false)
    private String statusCode;

    @Column(name = "classification_code", length = 100)
    private String classificationCode;

    @Column(name = "observed_at", nullable = false)
    private OffsetDateTime observedAt;

    @Column(name = "source", length = 60)
    private String source;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
