package id.tbcall.application.clinical;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;
import lombok.Getter;
import lombok.Setter;

public final class ClinicalDtos {
    private ClinicalDtos() {}
    public abstract static class Input {
        @JsonIgnore protected final Set<String> supplied=new LinkedHashSet<>();
        public boolean has(String field) { return supplied.contains(field); }
        @JsonAnySetter public void unsupported(String field,Object value) { throw new IllegalArgumentException("Unsupported clinical input field"); }
    }
    @Getter
    public static class PatientInput extends Input {
        @Size(max=255,message="Teks terlalu panjang.") private String fullName;
        @Size(max=50,message="Teks terlalu panjang.") private String citizenship;
        @Size(max=16,message="Teks terlalu panjang.") private String nik;
        @Size(max=100,message="Teks terlalu panjang.") private String otherIdentityNumber;
        @Size(max=50,message="Teks terlalu panjang.") private String bpjsNumber;
        @Size(max=150,message="Teks terlalu panjang.") private String birthPlace;
        private LocalDate birthDate;
        private Boolean birthDateUnknown;
        @Size(max=30,message="Teks terlalu panjang.") private String sexCode;
        @Size(max=40,message="Teks terlalu panjang.") private String phone;
        private String address;
        @Size(max=20,message="Teks terlalu panjang.") private String provinceCode;
        @Size(max=20,message="Teks terlalu panjang.") private String regencyCode;
        @Size(max=20,message="Teks terlalu panjang.") private String districtCode;
        @Size(max=20,message="Teks terlalu panjang.") private String villageCode;
        public void setFullName(String value) { fullName=value; supplied.add("fullName"); }
        public void setCitizenship(String value) { citizenship=value; supplied.add("citizenship"); }
        public void setNik(String value) { nik=value; supplied.add("nik"); }
        public void setOtherIdentityNumber(String value) { otherIdentityNumber=value; supplied.add("otherIdentityNumber"); }
        public void setBpjsNumber(String value) { bpjsNumber=value; supplied.add("bpjsNumber"); }
        public void setBirthPlace(String value) { birthPlace=value; supplied.add("birthPlace"); }
        public void setBirthDate(LocalDate value) { birthDate=value; supplied.add("birthDate"); }
        public void setBirthDateUnknown(Boolean value) { birthDateUnknown=value; supplied.add("birthDateUnknown"); }
        public void setSexCode(String value) { sexCode=value; supplied.add("sexCode"); }
        public void setPhone(String value) { phone=value; supplied.add("phone"); }
        public void setAddress(String value) { address=value; supplied.add("address"); }
        public void setProvinceCode(String value) { provinceCode=value; supplied.add("provinceCode"); }
        public void setRegencyCode(String value) { regencyCode=value; supplied.add("regencyCode"); }
        public void setDistrictCode(String value) { districtCode=value; supplied.add("districtCode"); }
        public void setVillageCode(String value) { villageCode=value; supplied.add("villageCode"); }
    }
    @Getter
    public static class RegistrationInput extends Input {
        private LocalDate registrationDate;
        @Size(max=100,message="Teks terlalu panjang.") private String facilityRegistrationNumber;
        @Size(max=100,message="Teks terlalu panjang.") private String medicalRecordNumber;
        @Size(max=100,message="Teks terlalu panjang.") private String specimenIdentityNumber;
        @Size(max=30,message="Teks terlalu panjang.") private String suspectTypeCode;
        @Size(max=80,message="Teks terlalu panjang.") private String previousTreatmentCategoryCode;
        @Size(max=50,message="Teks terlalu panjang.") private String referredByType;
        @Size(max=255,message="Teks terlalu panjang.") private String referredByReference;
        private String referralNotes;
        private BigDecimal initialWeightKg;
        @Size(max=30,message="Teks terlalu panjang.") private String hivStatusCode;
        @Size(max=30,message="Teks terlalu panjang.") private String dmStatusCode;
        public void setRegistrationDate(LocalDate value) { registrationDate=value; supplied.add("registrationDate"); }
        public void setFacilityRegistrationNumber(String value) { facilityRegistrationNumber=value; supplied.add("facilityRegistrationNumber"); }
        public void setMedicalRecordNumber(String value) { medicalRecordNumber=value; supplied.add("medicalRecordNumber"); }
        public void setSpecimenIdentityNumber(String value) { specimenIdentityNumber=value; supplied.add("specimenIdentityNumber"); }
        public void setSuspectTypeCode(String value) { suspectTypeCode=value; supplied.add("suspectTypeCode"); }
        public void setPreviousTreatmentCategoryCode(String value) { previousTreatmentCategoryCode=value; supplied.add("previousTreatmentCategoryCode"); }
        public void setReferredByType(String value) { referredByType=value; supplied.add("referredByType"); }
        public void setReferredByReference(String value) { referredByReference=value; supplied.add("referredByReference"); }
        public void setReferralNotes(String value) { referralNotes=value; supplied.add("referralNotes"); }
        public void setInitialWeightKg(BigDecimal value) { initialWeightKg=value; supplied.add("initialWeightKg"); }
        public void setHivStatusCode(String value) { hivStatusCode=value; supplied.add("hivStatusCode"); }
        public void setDmStatusCode(String value) { dmStatusCode=value; supplied.add("dmStatusCode"); }
    }
    @Getter
    public static class DiagnosisInput extends Input {
        private LocalDate diagnosisDate;
        @Size(max=30,message="Teks terlalu panjang.") private String anatomicalSiteCode;
        @Size(max=50,message="Teks terlalu panjang.") private String diagnosisTypeCode;
        @Size(max=255,message="Teks terlalu panjang.") private String diagnosisResult;
        @Size(max=50,message="Teks terlalu panjang.") private String chestXrayResult;
        private LocalDate chestXrayDate;
        @Size(max=100,message="Teks terlalu panjang.") private String chestXraySerial;
        private String chestXrayImpression;
        @Size(max=20,message="Teks terlalu panjang.") private String icd10Code;
        @Size(max=30,message="Teks terlalu panjang.") private String treatmentDisposition;
        private UUID referredToFacilityId;
        private String notes;
        public void setDiagnosisDate(LocalDate value) { diagnosisDate=value; supplied.add("diagnosisDate"); }
        public void setAnatomicalSiteCode(String value) { anatomicalSiteCode=value; supplied.add("anatomicalSiteCode"); }
        public void setDiagnosisTypeCode(String value) { diagnosisTypeCode=value; supplied.add("diagnosisTypeCode"); }
        public void setDiagnosisResult(String value) { diagnosisResult=value; supplied.add("diagnosisResult"); }
        public void setChestXrayResult(String value) { chestXrayResult=value; supplied.add("chestXrayResult"); }
        public void setChestXrayDate(LocalDate value) { chestXrayDate=value; supplied.add("chestXrayDate"); }
        public void setChestXraySerial(String value) { chestXraySerial=value; supplied.add("chestXraySerial"); }
        public void setChestXrayImpression(String value) { chestXrayImpression=value; supplied.add("chestXrayImpression"); }
        public void setIcd10Code(String value) { icd10Code=value; supplied.add("icd10Code"); }
        public void setTreatmentDisposition(String value) { treatmentDisposition=value; supplied.add("treatmentDisposition"); }
        public void setReferredToFacilityId(UUID value) { referredToFacilityId=value; supplied.add("referredToFacilityId"); }
        public void setNotes(String value) { notes=value; supplied.add("notes"); }
    }
    @Getter
    public static class CaseInput extends Input {
        @Size(max=30,message="Teks terlalu panjang.") private String caseCategoryCode;
        @Size(max=30,message="Teks terlalu panjang.") private String drugResistancePatternCode;
        private Boolean healthWorker;
        @Size(max=30,message="Teks terlalu panjang.") private String pregnancyStatusCode;
        private BigDecimal heightCm;
        private BigDecimal weightKg;
        @Size(max=30,message="Teks terlalu panjang.") private String bcgStatusCode;
        @Size(max=80,message="Teks terlalu panjang.") private String previousTreatmentCategoryCode;
        @Size(max=30,message="Teks terlalu panjang.") private String hivStatusCode;
        @Size(max=30,message="Teks terlalu panjang.") private String dmStatusCode;
        @Size(max=20,message="Teks terlalu panjang.") private String icd10Code;
        public void setCaseCategoryCode(String value) { caseCategoryCode=value; supplied.add("caseCategoryCode"); }
        public void setDrugResistancePatternCode(String value) { drugResistancePatternCode=value; supplied.add("drugResistancePatternCode"); }
        public void setHealthWorker(Boolean value) { healthWorker=value; supplied.add("healthWorker"); }
        public void setPregnancyStatusCode(String value) { pregnancyStatusCode=value; supplied.add("pregnancyStatusCode"); }
        public void setHeightCm(BigDecimal value) { heightCm=value; supplied.add("heightCm"); }
        public void setWeightKg(BigDecimal value) { weightKg=value; supplied.add("weightKg"); }
        public void setBcgStatusCode(String value) { bcgStatusCode=value; supplied.add("bcgStatusCode"); }
        public void setPreviousTreatmentCategoryCode(String value) { previousTreatmentCategoryCode=value; supplied.add("previousTreatmentCategoryCode"); }
        public void setHivStatusCode(String value) { hivStatusCode=value; supplied.add("hivStatusCode"); }
        public void setDmStatusCode(String value) { dmStatusCode=value; supplied.add("dmStatusCode"); }
        public void setIcd10Code(String value) { icd10Code=value; supplied.add("icd10Code"); }
    }

    @Getter @Setter
    public static class RegistrationCreate extends RegistrationInput {
        @NotNull(message="Fasyankes wajib diisi.") private UUID facilityId;
        @Valid private PatientInput newPatient;
        @Valid private ExistingPatient existingPatient;
    }
    @Getter @Setter
    public static class CaseConfirm extends CaseInput {
        @NotNull(message="Diagnosis wajib diisi.") private UUID diagnosisId;
    }
    public record IdentityInput(@Size(max=50) String citizenship,@Size(max=16) String nik,
            @Size(max=100) String otherIdentityNumber,LocalDate birthDate,@Size(max=255) String fullName,@Size(max=50) String bpjsNumber) {}
    public record ExistingPatient(@NotNull UUID patientId,@Size(max=50) String citizenship,@Size(max=16) String nik,
            @Size(max=100) String otherIdentityNumber,LocalDate birthDate,@Size(max=255) String fullName,@Size(max=50) String bpjsNumber) {
        public IdentityInput confirmation() { return new IdentityInput(citizenship,nik,otherIdentityNumber,birthDate,fullName,bpjsNumber); }
        public boolean hasConfirmation() { return citizenship!=null || nik!=null || otherIdentityNumber!=null || birthDate!=null || fullName!=null || bpjsNumber!=null; }
    }
    public record Label(String code,String name) {}
    public record FacilityDisplay(UUID id,String name) {}
    public record Demographics(String fullName,String citizenship,String nik,String otherIdentityNumber,String bpjsNumber,
            String birthPlace,LocalDate birthDate,boolean birthDateUnknown,Label sex,String phone,String address,
            String provinceCode,String regencyCode,String districtCode,String villageCode) {}
    public record PatientSummary(UUID patientId,long version,String fullName,Label sex,LocalDate birthDate,boolean birthDateUnknown) {}
    public record IdentityConfirmation(UUID patientId,String fullName,String citizenship,String nik,String otherIdentityNumber,
            String bpjsNumber,LocalDate birthDate,boolean birthDateUnknown,Label sex) {}
    public record RegistrationSummary(UUID id,long version,String status,LocalDate registrationDate,FacilityDisplay facility) {}
    public record DiagnosisSummary(UUID id,long version,LocalDate diagnosisDate,Label anatomicalSite,Label diagnosisType) {}
    public record CaseSummary(UUID id,long version,String status,Label caseCategory,FacilityDisplay currentFacility,DiagnosisSummary diagnosis) {}
    public record CaseListSummary(UUID id,long version,String status,Label caseCategory,FacilityDisplay currentFacility) {}
    public record PatientCaseSummary(CaseSummary summary,String hivStatusCode,String dmStatusCode) {}
    public record PatientListItem(UUID patientId,long version,String fullName,Label sex,LocalDate birthDate,boolean birthDateUnknown,
            String nik,String bpjsNumber,List<RegistrationSummary> registrations,List<CaseListSummary> cases) {}
    public record PatientPage(List<PatientListItem> content,int page,int size,long totalElements) {}
    public record CaseHistoryItem(UUID patientId,String fullName,OffsetDateTime confirmedAt,CaseListSummary tbCase) {}
    public record CaseHistoryPage(List<CaseHistoryItem> content,int page,int size,long totalElements) {}
    public record PatientDetail(UUID patientId,long version,Demographics demographics,List<RegistrationView> registrations,List<PatientCaseSummary> cases) {}
    public record RegistrationView(UUID id,long version,String status,PatientSummary patient,FacilityDisplay facility,
            LocalDate registrationDate,String facilityRegistrationNumber,String medicalRecordNumber,String specimenIdentityNumber,
            String suspectTypeCode,String previousTreatmentCategoryCode,String referredByType,String referredByReference,
            String referralNotes,BigDecimal initialWeightKg,String hivStatusCode,String dmStatusCode) {}
    public record DiagnosisView(UUID id,long version,UUID registrationId,long registrationVersion,LocalDate diagnosisDate,
            Label anatomicalSite,Label diagnosisType,String diagnosisResult,String chestXrayResult,LocalDate chestXrayDate,
            String chestXraySerial,String chestXrayImpression,String icd10Code,String treatmentDisposition,FacilityDisplay referredToFacility,String notes) {}
    public record CaseView(UUID id,long version,String status,FacilityDisplay currentFacility,PatientSummary patient,
            RegistrationSummary registration,DiagnosisSummary confirmingDiagnosis,String caseCategoryCode,String drugResistancePatternCode,
            Boolean healthWorker,String pregnancyStatusCode,BigDecimal heightCm,BigDecimal weightKg,String bcgStatusCode,
            String previousTreatmentCategoryCode,String hivStatusCode,String dmStatusCode,String icd10Code,OffsetDateTime confirmedAt) {}
    public record SelfPatient(UUID patientId,String fullName,Label sex,String birthPlace,LocalDate birthDate,boolean birthDateUnknown,
            String phone,String address,List<RegistrationSummary> registrations,List<CaseSummary> cases) {}
    public record PatientFilters(int page,int size,String name,String nik,String bpjs,String registrationStatus,String caseStatus,UUID facilityId) {}
}
