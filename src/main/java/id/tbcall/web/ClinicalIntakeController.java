package id.tbcall.web;

import id.tbcall.application.clinical.*;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

@RestController
@RequestMapping("/api/v1")
public class ClinicalIntakeController {
    private final PatientIdentityService identities;
    private final RegistrationService registrations;
    private final PatientService patients;
    private final DiagnosisService diagnoses;
    private final CaseService cases;
    private final ClinicalQueryService queries;
    public ClinicalIntakeController(PatientIdentityService identities,RegistrationService registrations,PatientService patients,
            DiagnosisService diagnoses,CaseService cases,ClinicalQueryService queries) {
        this.identities=identities; this.registrations=registrations; this.patients=patients; this.diagnoses=diagnoses; this.cases=cases; this.queries=queries;
    }
    @PostMapping("/patients/resolve") IdentityConfirmation resolve(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody IdentityInput input) {
        return identities.resolve(actor,input);
    }
    @PostMapping("/registrations") ResponseEntity<RegistrationView> createRegistration(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody RegistrationCreate input) {
        var response=registrations.create(actor,input); return ResponseEntity.status(201).eTag(IfMatch.etag(response.version())).body(response);
    }
    @GetMapping("/patients") PatientPage patients(@AuthenticationPrincipal CurrentActor actor,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
            @RequestParam(required=false) String name,@RequestParam(required=false) String nik,@RequestParam(required=false) String bpjs,
            @RequestParam(required=false) String registrationStatus,@RequestParam(required=false) String caseStatus,
            @RequestParam(required=false) UUID facilityId,@RequestParam Map<String,String> parameters) {
        // Spring Security also accepts its CSRF token as a request parameter; it is not a clinical filter.
        if(!Set.of("page","size","name","nik","bpjs","registrationStatus","caseStatus","facilityId","_csrf").containsAll(parameters.keySet()))
            throw ApplicationFailure.invalid("Filter daftar pasien tidak dikenal.");
        return queries.patients(actor,new PatientFilters(page,size,name,nik,bpjs,registrationStatus,caseStatus,facilityId));
    }
    @GetMapping("/patients/{patientId}") ResponseEntity<PatientDetail> patient(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID patientId) {
        var response=queries.patient(actor,patientId); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PatchMapping("/patients/{patientId}") ResponseEntity<PatientDetail> updatePatient(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID patientId,
            @Valid @RequestBody PatientInput input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=patients.update(actor,patientId,input,match); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @GetMapping("/registrations/{registrationId}") ResponseEntity<RegistrationView> registration(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID registrationId) {
        var response=queries.registration(actor,registrationId); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PatchMapping("/registrations/{registrationId}") ResponseEntity<RegistrationView> updateRegistration(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID registrationId,
            @Valid @RequestBody RegistrationInput input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=registrations.update(actor,registrationId,input,match); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PostMapping("/registrations/{registrationId}/diagnoses") ResponseEntity<DiagnosisView> diagnosis(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID registrationId,
            @Valid @RequestBody DiagnosisInput input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=diagnoses.create(actor,registrationId,input,match); return ResponseEntity.status(201).eTag(IfMatch.etag(response.version())).body(response);
    }
    @GetMapping("/registrations/{registrationId}/diagnoses") List<DiagnosisView> diagnoses(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID registrationId) {
        return queries.diagnoses(actor,registrationId);
    }
    @GetMapping("/diagnoses/{diagnosisId}") ResponseEntity<DiagnosisView> diagnosis(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID diagnosisId) {
        var response=queries.diagnosis(actor,diagnosisId); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PatchMapping("/diagnoses/{diagnosisId}") ResponseEntity<DiagnosisView> updateDiagnosis(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID diagnosisId,
            @Valid @RequestBody DiagnosisInput input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=diagnoses.update(actor,diagnosisId,input,match); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PostMapping("/registrations/{registrationId}/cases") ResponseEntity<CaseView> confirmCase(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID registrationId,
            @Valid @RequestBody CaseConfirm input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=cases.confirm(actor,registrationId,input,match); return ResponseEntity.status(201).eTag(IfMatch.etag(response.version())).body(response);
    }
    @GetMapping("/cases/{caseId}") ResponseEntity<CaseView> tbCase(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId) {
        var response=queries.tbCase(actor,caseId); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PatchMapping("/cases/{caseId}") ResponseEntity<CaseView> updateCase(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,
            @Valid @RequestBody CaseInput input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=cases.update(actor,caseId,input,match); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @GetMapping("/me/patient") SelfPatient self(@AuthenticationPrincipal CurrentActor actor) { return queries.self(actor); }
}
