package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity @Table(name="medication_schedules") @Getter @Setter @NoArgsConstructor
public class MedicationSchedule {
    @Id private UUID id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="treatment_id",nullable=false) private Treatment treatment;
    @Column(name="current_revision_id",nullable=false) private UUID currentRevisionId;
    @Version @Column(nullable=false) private long version;
    @Column(nullable=false,length=30) private String status;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="created_by_user_id",nullable=false) private User createdByUser;
    @Column(name="created_at",nullable=false) private OffsetDateTime createdAt;
    @Column(name="updated_at",nullable=false) private OffsetDateTime updatedAt;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="cancelled_by_user_id") private User cancelledByUser;
    @Column(name="cancelled_at") private OffsetDateTime cancelledAt;
}
