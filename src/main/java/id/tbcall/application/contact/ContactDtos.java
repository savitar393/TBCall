package id.tbcall.application.contact;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import id.tbcall.application.clinical.ClinicalDtos;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import lombok.Getter;

public final class ContactDtos {
    private ContactDtos() {}
    public record CreateInput(@NotBlank @Size(max=255) String fullName,LocalDate birthDate,@Size(max=30) String sexCode,
            @Size(max=40) String phone,String address,@Size(max=100) String relationshipToIndexCase,Boolean householdContact,
            @NotBlank String workflowType,UUID destinationFacilityId,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    @Getter public static class ContactPatch extends ClinicalDtos.Input {
        @Size(max=255) private String fullName;
        private LocalDate birthDate;
        @Size(max=30) private String sexCode;
        @Size(max=40) private String phone;
        private String address;
        @Size(max=100) private String relationshipToIndexCase;
        private Boolean householdContact;
        public void setFullName(String v) { fullName=v; supplied.add("fullName"); }
        public void setBirthDate(LocalDate v) { birthDate=v; supplied.add("birthDate"); }
        public void setSexCode(String v) { sexCode=v; supplied.add("sexCode"); }
        public void setPhone(String v) { phone=v; supplied.add("phone"); }
        public void setAddress(String v) { address=v; supplied.add("address"); }
        public void setRelationshipToIndexCase(String v) { relationshipToIndexCase=v; supplied.add("relationshipToIndexCase"); }
        public void setHouseholdContact(Boolean v) { householdContact=v; supplied.add("householdContact"); }
    }
    public record LinkInput(@NotNull UUID patientId,@Size(max=50) String citizenship,@Size(max=16) String nik,
            @Size(max=100) String otherIdentityNumber,LocalDate birthDate,@Size(max=255) String fullName,@Size(max=50) String bpjsNumber) {
        public ClinicalDtos.ExistingPatient confirmation() { return new ClinicalDtos.ExistingPatient(patientId,citizenship,nik,otherIdentityNumber,birthDate,fullName,bpjsNumber); }
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    public record EmptyInput() { @JsonAnySetter public void unsupported(String field,Object value) { reject(); } }
    public record ReceiveInput(OffsetDateTime receivedAt) { @JsonAnySetter public void unsupported(String field,Object value) { reject(); } }
    public record ReturnInput(@NotBlank String returnReason) { @JsonAnySetter public void unsupported(String field,Object value) { reject(); } }
    public record CompleteInput(OffsetDateTime investigatedAt,@Size(max=100) String resultCode,
            @NotNull Boolean activeTbExcluded,@NotNull Boolean tptEligible,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    public record TptStartInput(@Size(max=100) String regimenCode,String regimenDescription,@NotNull LocalDate startDate,
            LocalDate plannedEndDate,@Positive Integer durationValue,String durationUnit,BigDecimal weightKg,
            @Size(max=100) String drugSource,String notes) {
        @JsonAnySetter public void unsupported(String field,Object value) { reject(); }
    }
    @Getter public static class TptPatch extends ClinicalDtos.Input {
        private LocalDate plannedEndDate;
        @Positive private Integer durationValue;
        private String durationUnit;
        private BigDecimal weightKg;
        @Size(max=100) private String drugSource;
        private String regimenDescription;
        private String notes;
        public void setPlannedEndDate(LocalDate v) { plannedEndDate=v; supplied.add("plannedEndDate"); }
        public void setDurationValue(Integer v) { durationValue=v; supplied.add("durationValue"); }
        public void setDurationUnit(String v) { durationUnit=v; supplied.add("durationUnit"); }
        public void setWeightKg(BigDecimal v) { weightKg=v; supplied.add("weightKg"); }
        public void setDrugSource(String v) { drugSource=v; supplied.add("drugSource"); }
        public void setRegimenDescription(String v) { regimenDescription=v; supplied.add("regimenDescription"); }
        public void setNotes(String v) { notes=v; supplied.add("notes"); }
    }
    public record ClosureInput(LocalDate actualEndDate,String closureReason) { @JsonAnySetter public void unsupported(String field,Object value) { reject(); } }
    private static void reject() { throw new IllegalArgumentException("Unsupported contact/TPT input field"); }

    public record FacilityDisplay(UUID id,String name) {}
    public record CaseDisplay(UUID id,String categoryCode) {}
    public record ContactDisplay(UUID id,String fullName,LocalDate birthDate,String sexCode,String phone) {}
    public record InvestigationSummary(UUID id,long version,String workflowType,String status,OffsetDateTime requestedAt) {}
    public record TptSummary(UUID id,long version,String status,LocalDate startDate,FacilityDisplay facility) {}
    public record ContactDetail(UUID id,long version,String fullName,LocalDate birthDate,String sexCode,String phone,String address,
            String relationshipToIndexCase,Boolean householdContact,boolean linkedPatient,List<InvestigationSummary> investigations,List<TptSummary> tpt) {}
    public record InvestigationDetail(UUID id,long version,String workflowType,String status,OffsetDateTime requestedAt,
            OffsetDateTime receivedAt,OffsetDateTime investigatedAt,OffsetDateTime eligibilityAssessedAt,FacilityDisplay sourceFacility,
            FacilityDisplay destinationFacility,ContactDisplay contact,CaseDisplay indexCase,String resultCode,Boolean activeTbExcluded,
            Boolean tptEligible,String notes,String returnReason) {}
    public record TptDetail(UUID id,long version,UUID contactId,UUID indexCaseId,FacilityDisplay facility,String status,String regimenCode,
            String regimenName,String regimenDescription,LocalDate startDate,LocalDate plannedEndDate,LocalDate actualEndDate,
            Integer durationValue,String durationUnit,BigDecimal weightKg,String drugSource,String notes,String closureReason) {}
    public record SafeTpt(String status,String regimenDisplay,String regimenDescription,LocalDate startDate,LocalDate plannedEndDate,
            LocalDate actualEndDate,Integer durationValue,String durationUnit,FacilityDisplay facility) {}
    public record Page<T>(List<T> content,int page,int size,long totalElements) {}
}
