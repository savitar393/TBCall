package id.tbcall.application.treatment;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;

public final class MedicationScheduleDtos {
    private MedicationScheduleDtos() {}
    public record Definition(@NotBlank @Size(max=100) String timeZone,@NotNull LocalDate startDate,LocalDate endDate,
            @NotEmpty @Size(max=8) List<@NotNull @Pattern(regexp="(?:[01][0-9]|2[0-3]):[0-5][0-9]") String> times,
            @NotEmpty @Size(max=7) List<@NotNull @Min(1) @Max(7) Integer> weekdays) {
        @JsonAnySetter public void unsupported(String field,Object value){throw new IllegalArgumentException("Unsupported schedule field");}
    }
    public record Revision(UUID id,int revisionNumber,String status,String timeZone,LocalDate startDate,LocalDate endDate,
            String recurrence,List<Integer> weekdays,List<String> times,OffsetDateTime validFrom,OffsetDateTime validUntil,OffsetDateTime createdAt) {}
    /** Only ACTIVE treatments allow future expectations. A known history boundary is a date, never a precise termination instant. */
    public record Lifecycle(String treatmentStatus,boolean futureExpectationsAllowed,LocalDate actualEndDate,boolean historyBoundaryKnown) {}
    /** ABSENT has null id/version/revision. CANCELLED retains the prescription and historical occurrences before cancelledAt. */
    public record Prescription(String kind,UUID id,UUID treatmentId,Long version,String status,Revision currentRevision,OffsetDateTime cancelledAt,Lifecycle lifecycle) {}
    public record RevisionPage(List<Revision> content,int page,int size,long totalElements) {}
    /** Deterministic revision/date/time identity; this is prescribed expectation, never evidence that medication was taken. */
    public record Occurrence(String kind,String id,UUID scheduleId,UUID revisionId,UUID treatmentId,LocalDate localDate,
            String localTime,String timeZone,OffsetDateTime scheduledAt,String offsetResolution) {}
    public record TemporalException(UUID revisionId,LocalDate localDate,String localTime,String timeZone,String code) {}
    /** Inclusive local dates in each revision's clinical timezone, maximum 31 days. DST gaps are exceptions; overlaps use the earlier offset once. */
    public record CalendarPage(LocalDate from,LocalDate to,List<Occurrence> content,List<TemporalException> exceptions,Lifecycle lifecycle) {}
}
