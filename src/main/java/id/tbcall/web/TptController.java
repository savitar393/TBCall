package id.tbcall.web;

import id.tbcall.application.contact.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.contact.ContactDtos.*;

@RestController
@RequestMapping("/api/v1")
public class TptController {
    private final TptService service; private final ContactQueryService queries;
    public TptController(TptService service,ContactQueryService queries) { this.service=service; this.queries=queries; }
    @PostMapping("/contact-investigations/{id}/tpt") ResponseEntity<TptDetail> start(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody TptStartInput input) { return response(service.start(actor,id,input),201); }
    @GetMapping("/contacts/{contactId}/tpt") Page<TptDetail> history(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID contactId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.tptHistory(actor,contactId,page,size); }
    @GetMapping("/preventive-treatments/{id}") ResponseEntity<TptDetail> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id) { return response(queries.tpt(actor,id),200); }
    @PatchMapping("/preventive-treatments/{id}") ResponseEntity<TptDetail> patch(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody TptPatch input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.patch(actor,id,input,match),200); }
    @PostMapping("/preventive-treatments/{id}/complete") ResponseEntity<TptDetail> complete(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody ClosureInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.close(actor,id,input,match,"COMPLETED"),200); }
    @PostMapping("/preventive-treatments/{id}/stop") ResponseEntity<TptDetail> stop(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody ClosureInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.close(actor,id,input,match,"STOPPED"),200); }
    @PostMapping("/preventive-treatments/{id}/lost-to-follow-up") ResponseEntity<TptDetail> lost(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody ClosureInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.close(actor,id,input,match,"LOST_TO_FOLLOW_UP"),200); }
    @GetMapping("/me/tpt") SafeTpt self(@AuthenticationPrincipal CurrentActor actor) { return queries.self(actor); }
    private ResponseEntity<TptDetail> response(TptDetail detail,int status) { return ResponseEntity.status(status).eTag(IfMatch.etag(detail.version())).body(detail); }
}
