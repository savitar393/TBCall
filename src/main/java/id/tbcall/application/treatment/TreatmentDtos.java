package id.tbcall.application.treatment;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import id.tbcall.application.clinical.ClinicalDtos.Input;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import lombok.Getter;
import lombok.Setter;

/** Separate staff, patient and supporter projections. No persistence entities cross the API boundary. */
public final class TreatmentDtos {
    private TreatmentDtos() {}
    @Getter
    public static class MetadataInput extends Input {
        private LocalDate plannedEndDate,intensiveStartDate,intensiveEndDate,continuationStartDate,continuationEndDate;
        @Digits(integer=4,fraction=2) @DecimalMin(value="0",inclusive=false) private BigDecimal initialWeightKg;
        @Size(max=100) private String oatForm;
        @Size(max=100) private String drugSource;
        private String regimenDescription,notes;
        public void setPlannedEndDate(LocalDate v) { plannedEndDate=v; supplied.add("plannedEndDate"); }
        public void setInitialWeightKg(BigDecimal v) { initialWeightKg=v; supplied.add("initialWeightKg"); }
        public void setOatForm(String v) { oatForm=v; supplied.add("oatForm"); }
        public void setDrugSource(String v) { drugSource=v; supplied.add("drugSource"); }
        public void setIntensiveStartDate(LocalDate v) { intensiveStartDate=v; supplied.add("intensiveStartDate"); }
        public void setIntensiveEndDate(LocalDate v) { intensiveEndDate=v; supplied.add("intensiveEndDate"); }
        public void setContinuationStartDate(LocalDate v) { continuationStartDate=v; supplied.add("continuationStartDate"); }
        public void setContinuationEndDate(LocalDate v) { continuationEndDate=v; supplied.add("continuationEndDate"); }
        public void setRegimenDescription(String v) { regimenDescription=v; supplied.add("regimenDescription"); }
        public void setNotes(String v) { notes=v; supplied.add("notes"); }
    }
    @Getter @Setter
    public static class StartInput extends MetadataInput {
        @NotBlank @Size(max=100) private String regimenCode;
        @NotNull private LocalDate startDate;
        @NotEmpty @Size(min=1,max=20) private List<@NotNull @Valid DrugInput> drugs;
    }
    public record DrugInput(@NotBlank @Size(max=100) String drugCode,@Size(max=40) String treatmentPhase,
            @DecimalMin(value="0",inclusive=false) @Digits(integer=7,fraction=3) BigDecimal doseValue,@Size(max=30) String doseUnit,
            @Min(1) @Max(7) Integer frequencyPerWeek,@NotNull LocalDate startDate,LocalDate endDate,
            @Size(max=100) String batchNumber,@Size(max=100) String drugSource,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported treatment drug field"); }
    }
    public record DoseInput(@NotNull LocalDate scheduledDate,@NotBlank @Size(max=40) String status,
            @Size(max=40) String administrationMode,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported dose field"); }
    }
    public record ScheduleInput(@NotBlank @Size(max=80) String followUpType,@NotNull OffsetDateTime scheduledAt,UUID facilityId,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported follow-up field"); }
    }
    public record CompleteInput(@NotNull OffsetDateTime completedAt,@DecimalMin(value="0",inclusive=false) @Digits(integer=4,fraction=2) BigDecimal weightKg,
            String symptomSummary,@Size(max=80) String adherenceAssessment,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported follow-up field"); }
    }
    @Getter
    public static class AdverseUpdate extends Input {
        @Size(max=50) private String severity;
        private Boolean serious;
        private OffsetDateTime startedAt,endedAt;
        private String description,actionTaken,outcome;
        public void setSeverity(String v) { severity=v; supplied.add("severity"); }
        public void setSerious(Boolean v) { serious=v; supplied.add("serious"); }
        public void setStartedAt(OffsetDateTime v) { startedAt=v; supplied.add("startedAt"); }
        public void setEndedAt(OffsetDateTime v) { endedAt=v; supplied.add("endedAt"); }
        public void setDescription(String v) { description=v; supplied.add("description"); }
        public void setActionTaken(String v) { actionTaken=v; supplied.add("actionTaken"); }
        public void setOutcome(String v) { outcome=v; supplied.add("outcome"); }
    }
    @Getter @Setter
    public static class AdverseInput extends AdverseUpdate {
        @NotBlank @Size(max=150) private String eventType;
    }
    public record OutcomeInput(@NotBlank @Size(max=60) String outcomeCode,@NotNull LocalDate outcomeDate,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported outcome field"); }
    }
    public record Label(String code,String name) {}
    public record FacilityView(UUID id,String name) {}
    public record PatientContext(UUID id,String displayName) {}
    public record DrugView(UUID id,String drugCode,String drugName,String treatmentPhase,BigDecimal doseValue,String doseUnit,
            Integer frequencyPerWeek,LocalDate startDate,LocalDate endDate,String batchNumber,String drugSource,String notes) {}
    public record SafeDrug(String drugName,String treatmentPhase,BigDecimal doseValue,String doseUnit,Integer frequencyPerWeek,LocalDate startDate,LocalDate endDate) {}
    public record DoseView(UUID id,LocalDate scheduledDate,OffsetDateTime recordedAt,String status,String administrationMode,String source,UUID recordedByUserId,String notes) {}
    public record SafeDose(UUID id,LocalDate scheduledDate,OffsetDateTime recordedAt,String status,String administrationMode,String source) {}
    public record DosePage<T>(List<T> content,int page,int size,long totalElements) {}
    /** Counts of evidence records, not inferred daily adherence or medical scores. */
    public record EvidenceSummary(long totalReports,Map<String,Long> reportsByStatus) {}
    public record FollowUpView(UUID id,long version,UUID treatmentId,String followUpType,OffsetDateTime scheduledAt,OffsetDateTime completedAt,
            FacilityView facility,UUID healthWorkerId,String status,BigDecimal weightKg,String symptomSummary,String adherenceAssessment,String notes) {}
    public record SafeFollowUp(UUID id,UUID treatmentId,String followUpType,OffsetDateTime scheduledAt,OffsetDateTime completedAt,FacilityView facility,String status) {}
    public record AdverseView(UUID id,long version,UUID treatmentId,OffsetDateTime reportedAt,String eventType,String severity,boolean serious,
            OffsetDateTime startedAt,OffsetDateTime endedAt,String description,String actionTaken,String outcome) {}
    public record SafeAdverse(String eventType,String severity,boolean serious,OffsetDateTime reportedAt,OffsetDateTime startedAt,OffsetDateTime endedAt) {}
    public record OutcomeView(UUID id,String outcomeCode,String outcomeName,LocalDate outcomeDate,String notes) {}
    public record SafeOutcome(String outcomeCode,String outcomeName,LocalDate outcomeDate) {}
    public record LabRequestRef(UUID id,String status) {}
    public record TreatmentDetail(UUID id,long version,UUID caseId,PatientContext patient,FacilityView facility,Label regimen,String status,
            LocalDate startDate,LocalDate plannedEndDate,LocalDate actualEndDate,BigDecimal initialWeightKg,String oatForm,String drugSource,
            LocalDate intensiveStartDate,LocalDate intensiveEndDate,LocalDate continuationStartDate,LocalDate continuationEndDate,
            String regimenDescription,String notes,List<DrugView> drugs,EvidenceSummary adherenceSummary,List<DoseView> recentDoseEvents,
            List<FollowUpView> followUps,List<AdverseView> adverseEvents,OutcomeView outcome,List<LabRequestRef> followUpLabRequests) {}
    public record PatientTreatment(UUID id,String status,Label regimen,LocalDate startDate,LocalDate plannedEndDate,LocalDate actualEndDate,
            List<SafeDrug> drugs,List<SafeDose> recentDoseEvents,SafeOutcome outcome,List<SafeAdverse> adverseEvents) {}
    public record SupporterTreatment(UUID id,UUID caseId,String patientDisplayName,String status,Label regimen,LocalDate startDate,LocalDate plannedEndDate,
            List<SafeDrug> drugs,EvidenceSummary adherenceSummary,List<SafeDose> recentDoseEvents) {}
}
