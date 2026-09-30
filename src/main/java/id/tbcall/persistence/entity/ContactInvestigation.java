package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "contact_investigations")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class ContactInvestigation {
    @Version
    @Column(name = "version", nullable = false)
    private long version;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contact_id")
    private Contact contact;

    @Column(name = "workflow_type", length = 30)
    private String workflowType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_facility_id")
    private Facility sourceFacility;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "destination_facility_id")
    private Facility destinationFacility;

    @Column(name = "requested_at")
    private OffsetDateTime requestedAt;

    @Column(name = "received_at")
    private OffsetDateTime receivedAt;

    @Column(name = "investigated_at")
    private OffsetDateTime investigatedAt;

    @Column(name = "status", length = 30)
    private String status = "NEW";

    @Column(name = "result_code", length = 100)
    private String resultCode;

    @Column(name = "return_reason", columnDefinition = "text")
    private String returnReason;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
