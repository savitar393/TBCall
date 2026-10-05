package id.tbcall.application.monitoring;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import id.tbcall.application.clinical.ClinicalDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import lombok.Getter;

public final class MonitoringDtos {
    private MonitoringDtos() {}
    public record EventInput(@NotBlank String eventType,@NotNull OffsetDateTime scheduledAt,OffsetDateTime dueAt) {
        @JsonAnySetter public void unsupported(String name,Object value) { reject(); }
    }
    public record PlanInput(@NotNull LocalDate startDate,LocalDate endDate,String notes,
            @NotNull @Size(min=1,max=100) List<@NotNull @Valid EventInput> events) {
        @JsonAnySetter public void unsupported(String name,Object value) { reject(); }
    }
    @Getter public static class PlanPatch extends ClinicalDtos.Input {
        private LocalDate endDate; private String notes;
        public void setEndDate(LocalDate value) { endDate=value; supplied.add("endDate"); }
        public void setNotes(String value) { notes=value; supplied.add("notes"); }
    }
    @Getter public static class EventPatch extends ClinicalDtos.Input {
        private OffsetDateTime scheduledAt,dueAt;
        public void setScheduledAt(OffsetDateTime value) { scheduledAt=value; supplied.add("scheduledAt"); }
        public void setDueAt(OffsetDateTime value) { dueAt=value; supplied.add("dueAt"); }
    }
    public record CompletionInput(OffsetDateTime completedAt) { @JsonAnySetter public void unsupported(String name,Object value) { reject(); } }
    public record EmptyInput() { @JsonAnySetter public void unsupported(String name,Object value) { reject(); } }
    private static void reject() { throw new IllegalArgumentException("Unsupported monitoring input field"); }
    public record Page<T>(List<T> content,int page,int size,long totalElements) {}
    public record PlanDetail(UUID id,long version,String targetType,UUID targetId,String status,LocalDate startDate,
            LocalDate endDate,String rulesVersion,String notes,Map<String,Long> eventCounts,OffsetDateTime createdAt,OffsetDateTime updatedAt) {}
    public record EventDetail(UUID id,long version,String eventType,OffsetDateTime scheduledAt,OffsetDateTime dueAt,OffsetDateTime completedAt,String status) {}
    public record SafeEvent(String targetType,String eventType,OffsetDateTime scheduledAt,OffsetDateTime dueAt,String status,OffsetDateTime completedAt) {}
    public record AlertDetail(UUID id,long version,String alertType,String severity,String status,OffsetDateTime triggeredAt,
            OffsetDateTime dueAt,OffsetDateTime acknowledgedAt,OffsetDateTime resolvedAt,UUID monitoringEventId,
            String eventType,OffsetDateTime scheduledAt,String targetType,UUID targetId,String message) {}
    public record SafeAlert(UUID id,long version,String alertType,String severity,String status,OffsetDateTime triggeredAt,
            OffsetDateTime dueAt,String eventType,String message,boolean acknowledged) {}
    public record NotificationDetail(UUID id,long version,UUID alertId,String channel,String status,OffsetDateTime scheduledAt,
            OffsetDateTime deliveredAt,OffsetDateTime readAt,String alertType,String severity) {}
}
