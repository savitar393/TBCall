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
@Table(name = "diagnoses")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class Diagnosis {
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

    @Column(name = "diagnosis_date")
    private LocalDate diagnosisDate;

    @Column(name = "anatomical_site_code", length = 30)
    private String anatomicalSiteCode;

    @Column(name = "diagnosis_type_code", length = 50)
    private String diagnosisTypeCode;

    @Column(name = "diagnosis_result", length = 255)
    private String diagnosisResult;

    @Column(name = "chest_xray_result", length = 50)
    private String chestXrayResult;

    @Column(name = "chest_xray_date")
    private LocalDate chestXrayDate;

    @Column(name = "chest_xray_serial", length = 100)
    private String chestXraySerial;

    @Column(name = "chest_xray_impression", columnDefinition = "text")
    private String chestXrayImpression;

    @Column(name = "icd10_code", length = 20)
    private String icd10Code;

    @Column(name = "treatment_disposition", length = 30)
    private String treatmentDisposition;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "referred_to_facility_id")
    private Facility referredToFacility;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
