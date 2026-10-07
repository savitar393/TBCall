package id.tbcall.application.clinical;

import java.util.List;
import java.util.UUID;
import id.tbcall.application.clinical.ClinicalDtos.Label;

public final class ClinicalDirectoryDtos {
    private ClinicalDirectoryDtos() {}
    public record ReferenceData(List<Label> sexCodes,List<Label> suspectTypes,List<Label> previousTreatmentCategories,
            List<Label> hivStatuses,List<Label> dmStatuses,List<Label> anatomicalSites,List<Label> diagnosisTypes,
            List<Label> caseCategories,List<Label> drugResistancePatterns,List<Label> pregnancyStatuses,List<Label> bcgStatuses,
            List<Label> citizenships,List<Label> treatmentDispositions,List<Label> registrationStatusFilters,List<Label> caseStatusFilters) {}
    public record FacilityEntry(UUID id,String name,String facilityTypeCode,String provinceCode,String regencyCode) {}
    public record FacilityPage(List<FacilityEntry> content,int page,int size,long totalElements) {}
}
