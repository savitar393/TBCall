package id.tbcall.application.laboratory;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;

/** Explicit laboratory projections; no JPA entities or clinical history cross this boundary. */
public final class LabDtos {
    private LabDtos() {}
    public record CreateRequest(UUID registrationId,UUID caseId,@NotNull UUID testingFacilityId,
            @NotBlank @Size(max=40) String requestReasonCode,
            @NotEmpty @Size(max=10) List<@NotBlank @Size(max=60) String> testTypeCodes,
            @Size(max=100) String sampleShippingMethod,@Size(max=150) String courierName,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported laboratory field"); }
    }
    public record RecordSpecimen(@Size(max=100) String specimenCode,@NotBlank @Size(max=100) String specimenType,
            OffsetDateTime collectedAt,OffsetDateTime sentAt,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported laboratory field"); }
    }
    public record ReceiveSpecimen(@NotNull OffsetDateTime receivedAt,@Size(max=100) String conditionOnReceipt,
            @NotNull Boolean examinationPossible,String rejectionReason,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported laboratory field"); }
    }
    public record RecordResult(UUID specimenId,@NotNull OffsetDateTime testedAt,@Size(max=100) String resultCode,
            @Size(max=255) String resultValue,String resultText) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported laboratory field"); }
    }
    public record CorrectResult(@NotNull OffsetDateTime testedAt,@Size(max=100) String resultCode,
            @Size(max=255) String resultValue,String resultText) {
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported laboratory field"); }
    }
    public record Label(String code,String name) {}
    public record FacilityDisplay(UUID id,String name) {}
    public record PatientDisplay(UUID patientId,String fullName,Label sex,LocalDate birthDate,boolean birthDateUnknown) {}
    public record Owner(String type,UUID id) {}
    public record Completeness(int totalTests,int completedTests,int totalSpecimens,int receivedSpecimens,int usableSpecimens,boolean needsNewSpecimen) {}
    public record TestSummary(UUID id,long version,Label testType,String status) {}
    public record ResultView(UUID id,long version,UUID testId,UUID specimenId,int sequenceNo,String status,
            OffsetDateTime testedAt,String resultCode,String resultValue,String resultText) {}
    public record TestDetail(UUID id,long version,Label testType,String status,List<ResultView> latestResults) {}
    public record SpecimenView(UUID id,long version,UUID requestId,long requestVersion,String specimenCode,String specimenType,
            OffsetDateTime collectedAt,OffsetDateTime sentAt,OffsetDateTime receivedAt,String conditionOnReceipt,
            Boolean examinationPossible,String rejectionReason,String notes) {}
    public record RequestSummary(UUID id,long version,Owner owner,PatientDisplay patient,FacilityDisplay requestingFacility,
            FacilityDisplay testingFacility,Label requestReason,String referralType,OffsetDateTime requestedAt,String status,
            List<TestSummary> tests,Completeness completeness) {}
    public record RequestDetail(UUID id,long version,Owner owner,PatientDisplay patient,FacilityDisplay requestingFacility,
            FacilityDisplay testingFacility,Label requestReason,String referralType,OffsetDateTime requestedAt,String status,
            String sampleShippingMethod,String courierName,String notes,List<TestDetail> tests,List<SpecimenView> specimens,Completeness completeness) {}
    public record ResultResponse(UUID id,long version,UUID requestId,long requestVersion,UUID testId,long testVersion,
            UUID specimenId,int sequenceNo,String status,OffsetDateTime testedAt,String resultCode,String resultValue,String resultText) {}
    public record RequestPage(List<RequestSummary> content,int page,int size,long totalElements) {}
    public record Filters(int page,int size,String status,UUID testingFacilityId,UUID requestingFacilityId,String requestReasonCode,String ownerType) {}
}
