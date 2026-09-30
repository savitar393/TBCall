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
@Table(name = "treatments")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class Treatment {
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
    @JoinColumn(name = "facility_id")
    private Facility facility;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "regimen_id")
    private Regimen regimen;

    @Column(name = "regimen_description", columnDefinition = "text")
    private String regimenDescription;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "planned_end_date")
    private LocalDate plannedEndDate;

    @Column(name = "actual_end_date")
    private LocalDate actualEndDate;

    @Column(name = "initial_weight_kg", precision = 6, scale = 2)
    private BigDecimal initialWeightKg;

    @Column(name = "oat_form", length = 100)
    private String oatForm;

    @Column(name = "drug_source", length = 100)
    private String drugSource;

    @Column(name = "intensive_start_date")
    private LocalDate intensiveStartDate;

    @Column(name = "intensive_end_date")
    private LocalDate intensiveEndDate;

    @Column(name = "continuation_start_date")
    private LocalDate continuationStartDate;

    @Column(name = "continuation_end_date")
    private LocalDate continuationEndDate;

    @Column(name = "status", length = 30)
    private String status = "ACTIVE";

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
