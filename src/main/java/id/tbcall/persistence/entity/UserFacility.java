package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "user_facilities")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
@IdClass(UserFacility.Key.class)
public class UserFacility {
    @Id
    @Column(name = "user_id")
    private UUID userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private User user;

    @Id
    @Column(name = "facility_id")
    private UUID facilityId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "facility_id", insertable = false, updatable = false)
    private Facility facility;

    @Column(name = "is_primary")
    private Boolean isPrimary;

    @Column(name = "active")
    private Boolean active;

    @Column(name = "assigned_at")
    private OffsetDateTime assignedAt;

    @NoArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private static final long serialVersionUID = 1L;
        public UUID userId;
        public UUID facilityId;
    }
}
