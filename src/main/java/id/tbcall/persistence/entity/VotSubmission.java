package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;
import lombok.*;

/** Immutable submitted evidence; only a single review/cancellation and retention metadata may change. */
@Entity @Table(name="vot_submissions") @Getter @Setter @NoArgsConstructor
public class VotSubmission {
    @Id private UUID id;
    @Column(name="patient_id",nullable=false,updatable=false) private UUID patientId;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="treatment_id",nullable=false,updatable=false) private Treatment treatment;
    @Column(name="schedule_id",nullable=false,updatable=false) private UUID scheduleId;
    @Column(name="revision_id",nullable=false,updatable=false) private UUID revisionId;
    @Column(name="occurrence_id",nullable=false,length=100,updatable=false) private String occurrenceId;
    @Column(name="local_date",nullable=false,updatable=false) private LocalDate localDate;
    @Column(name="local_time",nullable=false,columnDefinition="time(0) without time zone",updatable=false) private LocalTime localTime;
    @Column(name="time_zone",nullable=false,length=100,updatable=false) private String timeZone;
    @Column(name="scheduled_at",nullable=false,updatable=false) private OffsetDateTime scheduledAt;
    @Column(name="uploaded_by_user_id",nullable=false,updatable=false) private UUID uploadedByUserId;
    @Column(name="patient_link_id",nullable=false,updatable=false) private UUID patientLinkId;
    @Column(name="media_key",nullable=false,length=36,updatable=false) private String mediaKey;
    @Column(name="content_type",nullable=false,length=30,updatable=false) private String contentType;
    @Column(name="media_size",nullable=false,updatable=false) private long mediaSize;
    @Column(name="submitted_at",nullable=false,updatable=false) private OffsetDateTime submittedAt;
    @Column(nullable=false,length=30) private String status;
    @Column(name="consent_acknowledged",nullable=false,updatable=false) private boolean consentAcknowledged;
    @Column(name="consent_policy_version",nullable=false,length=60,updatable=false) private String consentPolicyVersion;
    @Column(name="reviewed_at") private OffsetDateTime reviewedAt;
    @Column(name="reviewed_by_user_id") private UUID reviewedByUserId;
    @Column(name="review_notes",length=2000) private String reviewNotes;
    @Column(name="cancelled_at") private OffsetDateTime cancelledAt;
    @Column(name="cancelled_by_user_id") private UUID cancelledByUserId;
    @Column(name="retention_expires_at",nullable=false,updatable=false) private OffsetDateTime retentionExpiresAt;
    @Column(name="media_deleted_at") private OffsetDateTime mediaDeletedAt;
    @Version private long version;
    @Column(name="created_at",nullable=false,updatable=false) private OffsetDateTime createdAt;
    @Column(name="updated_at",nullable=false) private OffsetDateTime updatedAt;
}
