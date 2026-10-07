package id.tbcall.application.portal;

import java.util.List;

/** TBCall portal vocabulary, without clinical records or treatment recommendations. */
public final class PortalReferenceDtos {
    private PortalReferenceDtos() {}

    public record Option(String code, String name) {}

    public record ReferenceData(
            List<Option> treatmentStatuses,
            List<Option> tptStatuses,
            List<Option> patientDoseStatuses,
            List<Option> supporterDoseStatuses,
            List<Option> administrationModes,
            List<Option> followUpStatuses,
            List<Option> treatmentMonitoringEventTypes,
            List<Option> tptMonitoringEventTypes,
            List<Option> monitoringEventStatuses,
            List<Option> alertTypes,
            List<Option> alertStatuses,
            List<Option> alertSeverities,
            List<Option> notificationStatuses,
            List<Option> notificationChannels) {}
}
