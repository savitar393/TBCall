package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "diagnosis_types")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class DiagnosisType {
    @Id
    @Column(name = "code", length = 50)
    private String code;

    @Column(name = "name", length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @Column(name = "active")
    private Boolean active = true;
}
