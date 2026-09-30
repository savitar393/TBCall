package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "treatment_outcome_codes")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class TreatmentOutcomeCode {
    @Id
    @Column(name = "code", length = 60)
    private String code;

    @Column(name = "name", length = 200)
    private String name;

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @Column(name = "active")
    private Boolean active = true;
}
