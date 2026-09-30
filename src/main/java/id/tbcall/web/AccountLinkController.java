package id.tbcall.web;

import id.tbcall.application.identity.AccountLinkService;
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
            @RequestHeader(value="If-Match", required=false) String match) {
        PatientLinkResponse response=links.revokePatient(actor, patientId, match);
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
