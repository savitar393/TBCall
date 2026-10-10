package id.tbcall.application.dashboard;

import id.tbcall.application.clinical.ClinicalDtos.FacilityDisplay;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Read-only operational projections; a restricted section carries no data or counts. */
public final class DashboardDtos {
    private DashboardDtos() {}
    public enum State { AVAILABLE, PERMISSION_DENIED }
    public record Section<T>(State state,T data) {
        public static <T> Section<T> available(T data) { return new Section<>(State.AVAILABLE,data); }
        public static <T> Section<T> denied() { return new Section<>(State.PERMISSION_DENIED,null); }
    }
    public record Page<T>(List<T> content,int page,int size,long totalElements) {}
    public record CaseCounts(long active,long completed) {}
    public record FollowUpItem(UUID id,UUID treatmentId,String patientName,String followUpType,
            OffsetDateTime scheduledAt,FacilityDisplay facility) {}
    public record FollowUps(Page<FollowUpItem> upcoming,Page<FollowUpItem> overdue) {}
    public record LabItem(UUID id,String patientName,String status,OffsetDateTime requestedAt,
            FacilityDisplay requestingFacility,FacilityDisplay testingFacility) {}
    public record Dashboard(OffsetDateTime asOf,OffsetDateTime upcomingUntil,Section<CaseCounts> cases,
            Section<FollowUps> followUps,Section<Page<LabItem>> laboratory) {}
}
