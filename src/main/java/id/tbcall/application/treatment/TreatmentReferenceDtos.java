package id.tbcall.application.treatment;

import java.util.List;

/** Reference options only; no entities, clinical data or regimen recommendations. */
public final class TreatmentReferenceDtos {
    private TreatmentReferenceDtos() {}

    public record Option(String code, String name) {}
    public record RegimenOption(String code, String name, String caseCategoryCode) {}
    public record ReferenceData(
            List<RegimenOption> regimens,
            List<Option> drugs,
            List<Option> outcomeCodes,
            List<Option> treatmentStatuses,
            List<Option> staffDoseStatuses,
            List<Option> administrationModes,
            List<Option> followUpStatuses) {}
}
