package id.tbcall.web;

import id.tbcall.application.identity.AccountLinkService;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.identity.LinkDtos.*;

@RestController
@RequestMapping("/api/v1")
public class AccountLinkController {
    private final AccountLinkService links;
    public AccountLinkController(AccountLinkService links) { this.links=links; }
    @PostMapping("/patients/{patientId}/account-link")
    ResponseEntity<PatientLinkResponse> patient(@AuthenticationPrincipal CurrentActor actor, @PathVariable UUID patientId,
            @Valid @RequestBody LinkRequest body, @RequestHeader(value="If-Match", required=false) String match) {
        PatientLinkResult result=links.verifyPatient(actor, patientId, body.userId(), match);
        return ResponseEntity.status(result.created() ? 201 : 200).eTag(IfMatch.etag(result.response().version())).body(result.response());
    }
    @DeleteMapping("/patients/{patientId}/account-link")
    ResponseEntity<PatientLinkResponse> revoke(@AuthenticationPrincipal CurrentActor actor, @PathVariable UUID patientId,
            @RequestHeader(value="If-Match", required=false) String match,
            @RequestHeader(value="X-Expected-Link-Id",required=false) String expectedId) {
        if(expectedId==null || expectedId.isBlank()) throw new ApplicationFailure(428,"PRECONDITION_REQUIRED","Prasyarat diperlukan","ID tautan yang diharapkan wajib diisi.");
        if(!expectedId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
            throw ApplicationFailure.invalid("ID tautan tidak valid.");
        return revokeBound(actor,patientId,UUID.fromString(expectedId),match);
    }
    @DeleteMapping("/patients/{patientId}/account-links/{linkId}")
    ResponseEntity<PatientLinkResponse> revokeBound(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID patientId,
            @PathVariable UUID linkId,@RequestHeader(value="If-Match",required=false) String match) {
        PatientLinkResponse response=links.revokePatient(actor, patientId, linkId, match);
        return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PostMapping("/cases/{caseId}/supporters/{supporterId}/account-link")
    ResponseEntity<SupporterLinkResponse> supporter(@AuthenticationPrincipal CurrentActor actor, @PathVariable UUID caseId,
            @PathVariable UUID supporterId, @Valid @RequestBody LinkRequest body, @RequestHeader(value="If-Match", required=false) String match) {
        SupporterLinkResponse response=links.linkSupporter(actor, caseId, supporterId, body.userId(), match);
        return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @DeleteMapping("/cases/{caseId}/supporters/{supporterId}/account-link")
    ResponseEntity<SupporterLinkResponse> unlink(@AuthenticationPrincipal CurrentActor actor, @PathVariable UUID caseId,
            @PathVariable UUID supporterId, @RequestHeader(value="If-Match", required=false) String match) {
        SupporterLinkResponse response=links.unlinkSupporter(actor, caseId, supporterId, match);
        return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
}
