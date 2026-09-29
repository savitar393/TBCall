package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "hiv_statuses")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class HivStatus {
    @Id
    @Column(name = "code", length = 30)
    private String code;

    @Column(name = "name", length = 100)
    private String name;

    @Column(name = "active")
    private Boolean active;
}
