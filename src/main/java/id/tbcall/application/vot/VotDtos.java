package id.tbcall.application.vot;

import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;

public final class VotDtos {
    private VotDtos() {}
    public record Policy(boolean enabled,boolean syntheticOnly,long maxFileBytes,int retentionDays,String consentPolicyVersion) {}
    public record Submission(UUID id,UUID patientId,UUID treatmentId,UUID scheduleId,UUID revisionId,String occurrenceId,
            OffsetDateTime scheduledAt,LocalDate localDate,String localTime,String timeZone,String contentType,long size,
            OffsetDateTime submittedAt,String status,boolean consentAcknowledged,String consentPolicyVersion,
            OffsetDateTime reviewedAt,UUID reviewedByUserId,String reviewNotes,long version,
            OffsetDateTime retentionExpiresAt,OffsetDateTime mediaDeletedAt) {}
    public record Page(List<Submission> content,int page,int size,long totalElements) {}
    public record Review(@NotNull @Pattern(regexp="OBSERVED|NOT_VERIFIABLE") String decision,@Size(max=2000) String notes) {}
}
