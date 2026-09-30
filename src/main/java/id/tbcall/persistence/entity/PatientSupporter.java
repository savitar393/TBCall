package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "patient_supporters")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class PatientSupporter {
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

    @Column(name = "supporter_type", length = 30)
    private String supporterType;

    @Column(name = "supporter_status", length = 80)
    private String supporterStatus;

    @Column(name = "full_name", length = 255)
    private String fullName;

    @Column(name = "address", columnDefinition = "text")
    private String address;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "organization_name", length = 255)
    private String organizationName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_user_id")
    private User linkedUser;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "active")
    private Boolean active = true;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
