package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "previous_treatment_categories")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class PreviousTreatmentCategory {
    @Id
    @Column(name = "code", length = 80)
    private String code;

    @Column(name = "name", length = 200)
    private String name;

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @Column(name = "active")
    private Boolean active;
}
