package id.tbcall.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "drug_resistance_patterns")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class DrugResistancePattern {
    @Id
    @Column(name = "code", length = 30)
    private String code;

    @Column(name = "name", length = 200, nullable = false)
    private String name;

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @Column(name = "active", nullable = false)
    private Boolean active = true;
}
