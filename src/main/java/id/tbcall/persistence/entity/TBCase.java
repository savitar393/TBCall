package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "tb_cases")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class TBCase {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "registration_id")
    private TBRegistration registration;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "confirming_diagnosis_id")
    private Diagnosis confirmingDiagnosis;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_facility_id")
    private Facility currentFacility;

    @Column(name = "case_category_code", length = 30)
    private String caseCategoryCode;

    @Column(name = "health_worker")
    private Boolean healthWorker;

    @Column(name = "pregnancy_status_code", length = 30)
    private String pregnancyStatusCode;

    @Column(name = "height_cm", precision = 6, scale = 2)
    private BigDecimal heightCm;

    @Column(name = "weight_kg", precision = 6, scale = 2)
    private BigDecimal weightKg;

    @Column(name = "bcg_status_code", length = 30)
    private String bcgStatusCode;

    @Column(name = "previous_treatment_category_code", length = 80)
    private String previousTreatmentCategoryCode;

    @Column(name = "hiv_status_code", length = 30)
    private String hivStatusCode;

    @Column(name = "dm_status_code", length = 30)
    private String dmStatusCode;

    @Column(name = "icd10_code", length = 20)
    private String icd10Code;

    @Column(name = "confirmed_at")
    private OffsetDateTime confirmedAt;

    @Column(name = "closed_at")
    private OffsetDateTime closedAt;

    @Column(name = "status", length = 30)
    private String status;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
