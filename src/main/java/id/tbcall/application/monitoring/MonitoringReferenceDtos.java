package id.tbcall.application.monitoring;

import java.util.List;

/** TBCall code/name vocabulary only, without clinical data or monitoring recommendations. */
public final class MonitoringReferenceDtos {
    private MonitoringReferenceDtos() {}

    public record Option(String code, String name) {}
    public record ReferenceData(
            List<Option> treatmentEventTypes,
            List<Option> tptEventTypes,
            List<Option> planStatuses,
            List<Option> eventStatuses,
            List<Option> alertTypes,
            List<Option> alertStatuses,
            List<Option> alertSeverities,
            List<Option> alertTargetTypes,
            List<Option> notificationStatuses,
            List<Option> notificationChannels) {}
}
