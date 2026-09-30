package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.UUID;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "regimen_drugs")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
@IdClass(RegimenDrug.Key.class)
public class RegimenDrug {
    @Id
    @Column(name = "regimen_id")
    private UUID regimenId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "regimen_id", insertable = false, updatable = false)
    private Regimen regimen;

    @Id
    @Column(name = "drug_id")
    private UUID drugId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drug_id", insertable = false, updatable = false)
    private Drug drug;

    @Column(name = "phase", length = 40)
    private String phase;

    @Column(name = "dose_text", length = 255)
    private String doseText;

    @Column(name = "frequency_text", length = 255)
    private String frequencyText;

    @Id
    @Column(name = "sequence_no")
    private Integer sequenceNo = 1;

    @NoArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private static final long serialVersionUID = 1L;
        public UUID regimenId;
        public UUID drugId;
        public Integer sequenceNo;
    }
}
