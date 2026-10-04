package id.tbcall.application.referral;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;

public final class ReferralDtos {
    private ReferralDtos() {}
    public record SendInput(@NotBlank String referralType,@NotNull UUID destinationFacilityId,UUID treatmentId,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    public record ReceiveInput(OffsetDateTime receivedAt,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    public record ReturnInput(@NotBlank String returnReason) {
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    public record CancelInput(@NotBlank String cancelReason) {
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    public record ReportInput(OffsetDateTime patientReportedAt) {
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    private static void reject() { throw new IllegalArgumentException("Unsupported referral input field"); }

    public record FacilityDisplay(UUID id,String name) {}
    public record PatientDisplay(UUID id,String fullName) {}
    public record CaseDisplay(UUID id,String categoryCode,String status) {}
    public record TreatmentSummary(UUID id,String status,LocalDate startDate,LocalDate plannedEndDate,String regimenCode,String regimenName) {}
    public record Detail(UUID id,long version,String referralType,String status,OffsetDateTime sentAt,
            OffsetDateTime receivedAt,OffsetDateTime patientReportedAt,OffsetDateTime cancelledAt,
            FacilityDisplay sourceFacility,FacilityDisplay destinationFacility,PatientDisplay patient,
            CaseDisplay tbCase,TreatmentSummary treatment,String notes,String cancelReason,String returnReason) {}
    public record Page(List<Detail> content,int page,int size,long totalElements) {}
}
