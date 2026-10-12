package id.tbcall.web;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.reporting.*;
import id.tbcall.authorization.CurrentActor;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.reporting.ReportingDtos.*;

@RestController @RequestMapping("/api/v1/admin")
public class ReportingAdministrationController {
    private final ReportingGrantService grants; private final ReportingPublicationService publication;
    public ReportingAdministrationController(ReportingGrantService grants,ReportingPublicationService publication) { this.grants=grants; this.publication=publication; }
    @GetMapping("/users/{user}/reporting-scopes") ResponseEntity<List<Grant>> list(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID user) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(grants.list(actor,user));
    }
    @PostMapping("/users/{user}/reporting-scopes") ResponseEntity<Grant> assign(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID user,@RequestBody Map<String,Object> input) {
        if(!Set.of("scope","regionCode").containsAll(input.keySet()) || !(input.get("scope") instanceof String)
                || input.get("regionCode")!=null && !(input.get("regionCode") instanceof String)) throw ApplicationFailure.invalid("Penugasan lingkup tidak valid.");
        Grant grant=grants.assign(actor,user,(String)input.get("scope"),(String)input.get("regionCode"));
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).eTag(IfMatch.etag(grant.version())).body(grant);
    }
    @GetMapping("/users/{user}/reporting-scopes/{grant}") ResponseEntity<Grant> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID user,@PathVariable UUID grant) {
        Grant value=grants.read(actor,user,grant); return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag(IfMatch.etag(value.version())).body(value);
    }
    @DeleteMapping("/users/{user}/reporting-scopes/{grant}") ResponseEntity<Grant> revoke(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID user,@PathVariable UUID grant,@RequestHeader(value="If-Match",required=false) String match) {
        Grant value=grants.revoke(actor,user,grant,match); return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag(IfMatch.etag(value.version())).body(value);
    }
    @PostMapping("/reporting-snapshots") ResponseEntity<Candidate> capture(@AuthenticationPrincipal CurrentActor actor) {
        Candidate candidate=publication.capture(actor); return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).eTag(IfMatch.etag(candidate.version())).body(candidate);
    }
    @GetMapping("/reporting-snapshots/{snapshot}") ResponseEntity<Candidate> candidate(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID snapshot) {
        Candidate candidate=publication.read(actor,snapshot); return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag(IfMatch.etag(candidate.version())).body(candidate);
    }
    @PostMapping("/reporting-snapshots/{snapshot}/publish") ResponseEntity<Candidate> publish(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID snapshot,@RequestHeader(value="If-Match",required=false) String match,@RequestBody Map<String,Object> input) {
        if(!input.keySet().equals(Set.of("approved")) || !Boolean.TRUE.equals(input.get("approved")))
            throw ApplicationFailure.invalid("Persetujuan publikasi eksplisit diperlukan.");
        Candidate candidate=publication.publish(actor,snapshot,match); return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag(IfMatch.etag(candidate.version())).body(candidate);
    }
}
