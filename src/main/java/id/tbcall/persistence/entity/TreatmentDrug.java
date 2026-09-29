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
@Table(name = "treatment_drugs")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class TreatmentDrug {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "treatment_id")
    private Treatment treatment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drug_id")
    private Drug drug;

    @Column(name = "drug_name_snapshot", length = 255)
    private String drugNameSnapshot;

    @Column(name = "treatment_phase", length = 40)
    private String treatmentPhase;

    @Column(name = "dose_value", precision = 10, scale = 3)
    private BigDecimal doseValue;

    @Column(name = "dose_unit", length = 30)
    private String doseUnit;

    @Column(name = "frequency_per_week")
    private Integer frequencyPerWeek;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "batch_number", length = 100)
    private String batchNumber;

    @Column(name = "drug_source", length = 100)
    private String drugSource;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
