package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "tb_registrations")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class TBRegistration {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id")
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "facility_id")
    private Facility facility;

    @Column(name = "registration_date")
    private LocalDate registrationDate;

    @Column(name = "facility_registration_number", length = 100)
    private String facilityRegistrationNumber;

    @Column(name = "medical_record_number", length = 100)
    private String medicalRecordNumber;

    @Column(name = "specimen_identity_number", length = 100)
    private String specimenIdentityNumber;

    @Column(name = "suspect_type_code", length = 30)
    private String suspectTypeCode;

    @Column(name = "previous_treatment_category_code", length = 80)
    private String previousTreatmentCategoryCode;

    @Column(name = "referred_by_type", length = 50)
    private String referredByType;

    @Column(name = "referred_by_reference", length = 255)
    private String referredByReference;

    @Column(name = "referral_notes", columnDefinition = "text")
    private String referralNotes;

    @Column(name = "initial_weight_kg", precision = 6, scale = 2)
    private BigDecimal initialWeightKg;

    @Column(name = "hiv_status_code", length = 30)
    private String hivStatusCode;

    @Column(name = "dm_status_code", length = 30)
    private String dmStatusCode;

    @Column(name = "status", length = 30)
    private String status;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
