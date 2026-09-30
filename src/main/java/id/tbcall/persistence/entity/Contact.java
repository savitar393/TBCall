package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "contacts")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class Contact {
    @Version
    @Column(name = "version", nullable = false)
    private long version;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "index_case_id")
    private TBCase indexCase;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_patient_id")
    private Patient linkedPatient;

    @Column(name = "full_name", length = 255)
    private String fullName;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "sex_code", length = 30)
    private String sexCode;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "address", columnDefinition = "text")
    private String address;

    @Column(name = "relationship_to_index_case", length = 100)
    private String relationshipToIndexCase;

    @Column(name = "household_contact")
    private Boolean householdContact;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
