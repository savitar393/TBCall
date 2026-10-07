package id.tbcall.application.continuity;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ContinuityReadDtos {
    private ContinuityReadDtos() {}

    public record Option(String code,String name) {}
    public record FacilityDisplay(UUID id,String name) {}
    public record OpenTreatment(UUID id,String status,LocalDate startDate,LocalDate plannedEndDate,
            String regimenCode,String regimenName) {}
    public record ReferralPreparation(UUID caseId,String caseStatus,String caseCategoryCode,
            FacilityDisplay sourceFacility,FacilityDisplay preTreatmentDestination,
            OpenTreatment openTreatment,boolean inFlightReferral) {}
    public record FacilityOption(UUID id,String name,String facilityTypeCode,String provinceCode,String regencyCode) {}
    public record FacilityPage(List<FacilityOption> content,int page,int size,long totalElements) {}
    public record ReferralReferences(List<Option> referralTypes,List<Option> referralStatuses) {}
    public record ContactReferences(List<Option> workflowTypes,List<Option> creatableWorkflowTypes,
            List<Option> investigationStatuses) {}
    public record RegimenOption(String code,String name,String caseCategoryCode) {}
    public record TptReferences(List<RegimenOption> preventiveRegimens,List<Option> tptStatuses,
            List<Option> durationUnits) {}
}
