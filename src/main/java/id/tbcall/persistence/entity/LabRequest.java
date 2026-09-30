package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "lab_requests")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class LabRequest {
    @Version
    @Column(name = "version", nullable = false)
    private long version;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "registration_id")
    private TBRegistration registration;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "case_id")
    private TBCase tbCase;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requesting_facility_id")
    private Facility requestingFacility;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "testing_facility_id")
    private Facility testingFacility;

    @Column(name = "request_reason_code", length = 40)
    private String requestReasonCode;

    @Column(name = "referral_type", length = 20)
    private String referralType;

    @Column(name = "requested_at")
    private OffsetDateTime requestedAt;

    @Column(name = "sample_shipping_method", length = 100)
    private String sampleShippingMethod;

    @Column(name = "courier_name", length = 150)
    private String courierName;

    @Column(name = "status", length = 30)
    private String status = "REQUESTED";

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
