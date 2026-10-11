package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Prescribed fields are immutable snapshots; only retirement metadata changes. */
@Entity @Table(name="medication_schedule_revisions") @Getter @Setter @NoArgsConstructor
public class MedicationScheduleRevision {
    @Id private UUID id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="schedule_id",nullable=false,updatable=false) private MedicationSchedule schedule;
    @Column(name="revision_number",nullable=false,updatable=false) private int revisionNumber;
    @Column(nullable=false,length=30) private String status;
    @Column(name="time_zone",nullable=false,length=100,updatable=false) private String timeZone;
    @Column(name="start_date",nullable=false,updatable=false) private LocalDate startDate;
    @Column(name="end_date",updatable=false) private LocalDate endDate;
    @Column(name="weekday_mask",nullable=false,updatable=false) private int weekdayMask;
    @Column(name="valid_from",nullable=false,updatable=false) private OffsetDateTime validFrom;
    @Column(name="valid_until") private OffsetDateTime validUntil;
    @ElementCollection @CollectionTable(name="medication_schedule_times",joinColumns=@JoinColumn(name="revision_id"))
    @Column(name="local_time",nullable=false,columnDefinition="time(0) without time zone") private Set<LocalTime> times=new HashSet<>();
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="created_by_user_id",nullable=false,updatable=false) private User createdByUser;
    @Column(name="created_at",nullable=false,updatable=false) private OffsetDateTime createdAt;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="retired_by_user_id") private User retiredByUser;
    @Column(name="retired_at") private OffsetDateTime retiredAt;
}
