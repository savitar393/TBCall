package id.tbcall.web;

import id.tbcall.application.referral.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.referral.ReferralDtos.*;

@RestController
@RequestMapping("/api/v1")
public class ReferralController {
    private final ReferralService service; private final ReferralQueryService queries;
    public ReferralController(ReferralService service,ReferralQueryService queries) { this.service=service; this.queries=queries; }
    @PostMapping("/cases/{caseId}/referrals") ResponseEntity<Detail> send(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@Valid @RequestBody SendInput input) {
        return response(service.send(actor,caseId,input),201);
    }
    @GetMapping("/referrals/incoming") Page incoming(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.incoming(actor,page,size); }
    @GetMapping("/referrals/outgoing") Page outgoing(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.outgoing(actor,page,size); }
    @GetMapping("/referrals/{referralId}") ResponseEntity<Detail> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID referralId) { return response(queries.detail(actor,referralId),200); }
    @PostMapping("/referrals/{referralId}/receive") ResponseEntity<Detail> receive(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID referralId,@Valid @RequestBody ReceiveInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.receive(actor,referralId,input,match),200); }
    @PostMapping("/referrals/{referralId}/return") ResponseEntity<Detail> returnReferral(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID referralId,@Valid @RequestBody ReturnInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.returnReferral(actor,referralId,input,match),200); }
    @PostMapping("/referrals/{referralId}/cancel") ResponseEntity<Detail> cancel(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID referralId,@Valid @RequestBody CancelInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.cancel(actor,referralId,input,match),200); }
    @PostMapping("/referrals/{referralId}/report") ResponseEntity<Detail> report(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID referralId,@Valid @RequestBody ReportInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.report(actor,referralId,input,match),200); }
    private ResponseEntity<Detail> response(Detail result,int status) { return ResponseEntity.status(status).eTag(IfMatch.etag(result.version())).body(result); }
}
