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
public class ContactController {
    private final ContactService service; private final ContactQueryService queries;
    public ContactController(ContactService service,ContactQueryService queries) { this.service=service; this.queries=queries; }
    @PostMapping("/cases/{caseId}/contacts") ResponseEntity<ContactDetail> create(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@Valid @RequestBody CreateInput input) { return response(service.create(actor,caseId,input),201); }
    @GetMapping("/cases/{caseId}/contacts") Page<ContactDetail> list(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.contacts(actor,caseId,page,size); }
    @GetMapping("/contacts/{contactId}") ResponseEntity<ContactDetail> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID contactId) { return response(queries.contact(actor,contactId),200); }
    @PatchMapping("/contacts/{contactId}") ResponseEntity<ContactDetail> patch(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID contactId,@Valid @RequestBody ContactPatch input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.patch(actor,contactId,input,match),200); }
    @PostMapping("/contacts/{contactId}/link-patient") ResponseEntity<ContactDetail> link(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID contactId,@Valid @RequestBody LinkInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.link(actor,contactId,input,match),200); }
    private ResponseEntity<ContactDetail> response(ContactDetail detail,int status) { return ResponseEntity.status(status).eTag(IfMatch.etag(detail.version())).body(detail); }
}
