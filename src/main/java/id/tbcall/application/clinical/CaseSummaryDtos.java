package id.tbcall.application.clinical;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import id.tbcall.application.treatment.TreatmentDtos.SafeDose;
import static id.tbcall.application.clinical.ClinicalDtos.*;

/** Read-only, minimal episode projections. Denied sections carry no data or counts. */
public final class CaseSummaryDtos {
    private CaseSummaryDtos() {}
    public enum State { AVAILABLE, PERMISSION_DENIED, OUT_OF_SCOPE }
    public record Section<T>(State state,T data) {
        public static <T> Section<T> available(T data) { return new Section<>(State.AVAILABLE,data); }
        public static <T> Section<T> denied() { return new Section<>(State.PERMISSION_DENIED,null); }
        public static <T> Section<T> outside() { return new Section<>(State.OUT_OF_SCOPE,null); }
    }
    public record Page<T>(List<T> content,int page,int size,long totalElements) {}
    public record Slice<T>(List<T> content,boolean hasMore) {}
    public record DiagnosisItem(UUID id,LocalDate diagnosisDate,String anatomicalSiteCode,String diagnosisTypeCode,
            String diagnosisResult,String treatmentDisposition,boolean confirming) {}
    public record ResultItem(UUID id,UUID testId,UUID specimenId,String testTypeCode,int sequenceNo,String status,
            OffsetDateTime testedAt,String resultCode,String resultValue,String resultText,boolean latest) {}
    public record LabItem(UUID id,String ownerType,String status,String requestReasonCode,OffsetDateTime requestedAt,
            FacilityDisplay requestingFacility,FacilityDisplay testingFacility,Slice<ResultItem> results) {}
    public record DrugItem(String drugName,String treatmentPhase,BigDecimal doseValue,String doseUnit,
            Integer frequencyPerWeek,LocalDate startDate,LocalDate endDate) {}
    public record FollowItem(UUID id,String followUpType,String status,OffsetDateTime scheduledAt,OffsetDateTime completedAt,
            FacilityDisplay facility,BigDecimal weightKg,String symptomSummary,String adherenceAssessment) {}
    public record OutcomeItem(String outcomeCode,String outcomeName,LocalDate outcomeDate) {}
    public record TreatmentItem(UUID id,String status,FacilityDisplay facility,String regimenName,LocalDate startDate,
            LocalDate plannedEndDate,LocalDate actualEndDate,Slice<DrugItem> drugs,Section<Slice<SafeDose>> doses,
            Section<Slice<FollowItem>> followUps,Section<OutcomeItem> outcome) {}
    public record Summary(UUID caseId,String fullName,String status,FacilityDisplay currentFacility,String caseCategoryCode,
            OffsetDateTime confirmedAt,Section<RegistrationSummary> registration,Section<Page<DiagnosisItem>> diagnoses,
            Section<Page<LabItem>> laboratory,Section<Page<TreatmentItem>> treatments) {}
}
