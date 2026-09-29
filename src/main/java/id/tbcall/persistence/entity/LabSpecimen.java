package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "lab_specimens")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class LabSpecimen {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lab_request_id")
    private LabRequest labRequest;

    @Column(name = "specimen_code", length = 100)
    private String specimenCode;

    @Column(name = "specimen_type", length = 100)
    private String specimenType;

    @Column(name = "collected_at")
    private OffsetDateTime collectedAt;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    @Column(name = "received_at")
    private OffsetDateTime receivedAt;

    @Column(name = "condition_on_receipt", length = 100)
    private String conditionOnReceipt;

    @Column(name = "examination_possible")
    private Boolean examinationPossible;

    @Column(name = "rejection_reason", columnDefinition = "text")
    private String rejectionReason;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
