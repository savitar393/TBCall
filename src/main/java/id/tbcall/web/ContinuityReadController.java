package id.tbcall.web;

import id.tbcall.application.continuity.ContinuityReadService;
import id.tbcall.authorization.CurrentActor;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.continuity.ContinuityReadDtos.*;

@RestController
@RequestMapping("/api/v1")
public class ContinuityReadController {
    private final ContinuityReadService reads;

    public ContinuityReadController(ContinuityReadService reads) { this.reads=reads; }

    @GetMapping("/cases/{caseId}/referral-preparation")
    ReferralPreparation preparation(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId) {
        return reads.referralPreparation(actor,caseId);
    }

    @GetMapping("/continuity-facilities")
    FacilityPage facilities(@AuthenticationPrincipal CurrentActor actor,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
            @RequestParam(required=false) String query) {
        return reads.facilities(actor,page,size,query);
    }

    @GetMapping("/referral-reference-data")
    ReferralReferences referralReferences(@AuthenticationPrincipal CurrentActor actor) { return reads.referralReferences(actor); }

    @GetMapping("/contact-reference-data")
    ContactReferences contactReferences(@AuthenticationPrincipal CurrentActor actor) { return reads.contactReferences(actor); }

    @GetMapping("/tpt-reference-data")
    TptReferences tptReferences(@AuthenticationPrincipal CurrentActor actor) { return reads.tptReferences(actor); }
}
