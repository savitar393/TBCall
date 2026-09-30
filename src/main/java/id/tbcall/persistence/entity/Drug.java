package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "drugs")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class Drug {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @Column(name = "code", length = 100)
    private String code;

    @Column(name = "name", length = 255)
    private String name;

    @Column(name = "strength", length = 100)
    private String strength;

    @Column(name = "dosage_form", length = 100)
    private String dosageForm;

    @Column(name = "active")
    private Boolean active = true;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
