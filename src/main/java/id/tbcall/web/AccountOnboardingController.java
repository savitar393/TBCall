package id.tbcall.web;

import id.tbcall.application.identity.*;
import id.tbcall.authorization.CurrentActor;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.identity.OnboardingDtos.*;

@RestController @RequestMapping("/api/v1")
public class AccountOnboardingController {
    private final OnboardingQueryService reads;
    private final AccountResolutionService resolution;
    private final SupporterOnboardingService supporters;
    public AccountOnboardingController(OnboardingQueryService reads,AccountResolutionService resolution,SupporterOnboardingService supporters) {
        this.reads=reads;this.resolution=resolution;this.supporters=supporters;
    }
    @PostMapping("/patients/{patientId}/account-link/resolve-user")
    Candidate patientCandidate(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID patientId,@RequestBody ResolveInput body) {
        return resolution.patient(actor,patientId,body.identity());
    }
    @GetMapping("/patients/{patientId}/account-link")
    ResponseEntity<PatientState> patient(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID patientId) {
        return versioned(reads.patient(actor,patientId));
    }
    @GetMapping("/patients/{patientId}/account-link/precondition")
    ResponseEntity<PairState> pair(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID patientId,@RequestParam UUID userId) {
        return versioned(reads.pair(actor,patientId,userId));
    }
    @GetMapping("/cases/{caseId}/supporters")
    SupporterPage supporters(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return reads.supporters(actor,caseId,page,size);
    }
    @PostMapping("/cases/{caseId}/supporters")
    ResponseEntity<SupporterDetail> create(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@RequestBody SupporterInput body) {
        var result=supporters.create(actor,caseId,body);return ResponseEntity.status(201).eTag(IfMatch.etag(result.version())).body(result);
    }
    @GetMapping("/cases/{caseId}/supporters/{supporterId}")
    ResponseEntity<SupporterDetail> supporter(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@PathVariable UUID supporterId) {
        var result=reads.supporter(actor,caseId,supporterId);return ResponseEntity.ok().eTag(IfMatch.etag(result.version())).body(result);
    }
    @PostMapping("/cases/{caseId}/supporters/{supporterId}/account-link/resolve-user")
    Candidate supporterCandidate(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@PathVariable UUID supporterId,@RequestBody ResolveInput body) {
        return resolution.supporter(actor,caseId,supporterId,body.identity());
    }
    private static <T> ResponseEntity<T> versioned(Versioned<T> result) {
        var response=ResponseEntity.ok();if(result.version()!=null)response.eTag(IfMatch.etag(result.version()));return response.body(result.value());
    }
}
