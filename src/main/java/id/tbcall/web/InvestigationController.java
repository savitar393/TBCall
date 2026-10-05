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
@RequestMapping("/api/v1/contact-investigations")
public class InvestigationController {
    private final InvestigationService service; private final ContactQueryService queries;
    public InvestigationController(InvestigationService service,ContactQueryService queries) { this.service=service; this.queries=queries; }
    @GetMapping("/incoming") Page<InvestigationDetail> incoming(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.incoming(actor,page,size); }
    @GetMapping("/outgoing") Page<InvestigationDetail> outgoing(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.outgoing(actor,page,size); }
    @GetMapping("/{id}") ResponseEntity<InvestigationDetail> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id) { return response(queries.investigation(actor,id)); }
    @PostMapping("/{id}/receive") ResponseEntity<InvestigationDetail> receive(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody ReceiveInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.receive(actor,id,input,match)); }
    @PostMapping("/{id}/start") ResponseEntity<InvestigationDetail> start(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EmptyInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.start(actor,id,match)); }
    @PostMapping("/{id}/return") ResponseEntity<InvestigationDetail> returnInvestigation(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody ReturnInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.returnInvestigation(actor,id,input,match)); }
    @PostMapping("/{id}/cancel") ResponseEntity<InvestigationDetail> cancel(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EmptyInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.cancel(actor,id,match)); }
    @PostMapping("/{id}/complete") ResponseEntity<InvestigationDetail> complete(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody CompleteInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.complete(actor,id,input,match)); }
    private ResponseEntity<InvestigationDetail> response(InvestigationDetail detail) { return ResponseEntity.ok().eTag(IfMatch.etag(detail.version())).body(detail); }
}
