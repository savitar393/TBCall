package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "referrals")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class Referral {
    @Version
    @Column(name = "version", nullable = false)
    private long version;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "case_id")
    private TBCase tbCase;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "treatment_id")
    private Treatment treatment;

    @Column(name = "referral_type", length = 40)
    private String referralType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_facility_id")
    private Facility sourceFacility;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "destination_facility_id")
    private Facility destinationFacility;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    @Column(name = "received_at")
    private OffsetDateTime receivedAt;

    @Column(name = "patient_reported_at")
    private OffsetDateTime patientReportedAt;

    @Column(name = "status", length = 30)
    private String status = "SENT";

    @Column(name = "cancelled_at")
    private OffsetDateTime cancelledAt;

    @Column(name = "cancel_reason", columnDefinition = "text")
    private String cancelReason;

    @Column(name = "return_reason", columnDefinition = "text")
    private String returnReason;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
