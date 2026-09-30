package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "dm_statuses")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class DmStatus {
    @Id
    @Column(name = "code", length = 30)
    private String code;

    @Column(name = "name", length = 100)
    private String name;

    @Column(name = "active")
    private Boolean active = true;
}
