package id.tbcall.web;

import id.tbcall.application.admin.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.admin.AdminDtos.*;

@RestController
@RequestMapping("/api/v1/admin")
public class AdministrationController {
    private final FacilityAdministrationService facilities;
    private final UserLookupService lookup;
    private final FacilityMembershipService memberships;
    private final UserAdministrationService users;
    public AdministrationController(FacilityAdministrationService facilities, UserLookupService lookup,
            FacilityMembershipService memberships, UserAdministrationService users) {
        this.facilities=facilities; this.lookup=lookup; this.memberships=memberships; this.users=users;
    }
    @PostMapping("/facilities")
    ResponseEntity<FacilityResponse> create(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody FacilityInput input) {
        FacilityResponse response=facilities.create(actor,input); return ResponseEntity.status(201).eTag(IfMatch.etag(response.version())).body(response);
    }
    @PatchMapping("/facilities/{facilityId}")
    ResponseEntity<FacilityResponse> update(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID facilityId,
            @Valid @RequestBody FacilityInput input,@RequestHeader(value="If-Match",required=false) String match) {
        return facilityResponse(facilities.update(actor,facilityId,input,match));
    }
    @PostMapping("/facilities/{facilityId}/deactivate")
    ResponseEntity<FacilityResponse> deactivate(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID facilityId,
            @RequestHeader(value="If-Match",required=false) String match) { return facilityResponse(facilities.deactivate(actor,facilityId,match)); }
    @GetMapping("/users/lookup") UserLookupResponse lookup(@AuthenticationPrincipal CurrentActor actor,@RequestParam String identity) { return lookup.lookup(actor,identity); }
    @PostMapping("/facilities/{facilityId}/users/{userId}")
    MembershipResponse assign(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID facilityId,@PathVariable UUID userId,
            @RequestBody(required=false) MembershipInput input) { return memberships.assign(actor,facilityId,userId,input!=null && input.primaryRequested()); }
    @DeleteMapping("/facilities/{facilityId}/users/{userId}")
    MembershipResponse remove(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID facilityId,@PathVariable UUID userId) { return memberships.remove(actor,facilityId,userId); }
    @PostMapping("/users/{userId}/roles/{roleCode}")
    RoleResponse assignRole(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID userId,@PathVariable String roleCode) { return users.assignRole(actor,userId,roleCode); }
    @DeleteMapping("/users/{userId}/roles/{roleCode}")
    RoleResponse removeRole(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID userId,@PathVariable String roleCode) { return users.removeRole(actor,userId,roleCode); }
    @PostMapping("/users/{userId}/suspend")
    ResponseEntity<StatusResponse> suspend(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID userId,
            @RequestHeader(value="If-Match",required=false) String match) { return statusResponse(users.suspend(actor,userId,match)); }
    @PostMapping("/users/{userId}/reactivate")
    ResponseEntity<StatusResponse> reactivate(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID userId,
            @RequestHeader(value="If-Match",required=false) String match) { return statusResponse(users.reactivate(actor,userId,match)); }
    @PostMapping("/users/{userId}/disable")
    ResponseEntity<StatusResponse> disable(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID userId,
            @RequestHeader(value="If-Match",required=false) String match) { return statusResponse(users.disable(actor,userId,match)); }
    private ResponseEntity<FacilityResponse> facilityResponse(FacilityResponse response) { return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response); }
    private ResponseEntity<StatusResponse> statusResponse(StatusResponse response) { return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response); }
}
