package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "lab_request_reasons")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class LabRequestReason {
    @Id
    @Column(name = "code", length = 40)
    private String code;

    @Column(name = "name", length = 150)
    private String name;

    @Column(name = "active")
    private Boolean active = true;
}
