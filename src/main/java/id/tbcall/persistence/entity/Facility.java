package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "facilities")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class Facility {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @Column(name = "facility_type_code", length = 50)
    private String facilityTypeCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_facility_id")
    private Facility parentFacility;

    @Column(name = "name", length = 255)
    private String name;

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

    @Column(name = "postal_code", length = 10)
    private String postalCode;

    @Column(name = "latitude", precision = 9, scale = 6)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 9, scale = 6)
    private BigDecimal longitude;

    @Column(name = "active")
    private Boolean active;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
