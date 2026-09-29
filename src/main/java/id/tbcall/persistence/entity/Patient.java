package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "patients")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class Patient {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @Column(name = "nik", length = 16)
    private String nik;

    @Column(name = "other_identity_number", length = 100)
    private String otherIdentityNumber;

    @Column(name = "bpjs_number", length = 50)
    private String bpjsNumber;

    @Column(name = "full_name", length = 255)
    private String fullName;

    @Column(name = "citizenship", length = 50)
    private String citizenship;

    @Column(name = "birth_place", length = 150)
    private String birthPlace;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "birth_date_unknown")
    private Boolean birthDateUnknown;

    @Column(name = "sex_code", length = 30)
    private String sexCode;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "address", columnDefinition = "text")
    private String address;

    @Column(name = "province_code", length = 20)
    private String provinceCode;

    @Column(name = "regency_code", length = 20)
    private String regencyCode;

    @Column(name = "district_code", length = 20)
    private String districtCode;

    @Column(name = "village_code", length = 20)
    private String villageCode;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
