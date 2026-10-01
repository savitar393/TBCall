package id.tbcall.web;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.laboratory.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.laboratory.LabDtos.*;

@RestController
@RequestMapping("/api/v1")
public class LaboratoryController {
    private final LabRequestService requests;
    private final LabQueryService queries;
    private final LabSpecimenService specimens;
    private final LabResultService results;
    public LaboratoryController(LabRequestService requests,LabQueryService queries,LabSpecimenService specimens,LabResultService results) {
        this.requests=requests; this.queries=queries; this.specimens=specimens; this.results=results;
    }
    @PostMapping("/lab-requests") ResponseEntity<RequestDetail> create(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody CreateRequest input) {
        var response=requests.create(actor,input); return ResponseEntity.status(201).eTag(IfMatch.etag(response.version())).body(response);
    }
    @GetMapping("/lab-requests") RequestPage list(@AuthenticationPrincipal CurrentActor actor,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String status,
            @RequestParam(required=false) UUID testingFacilityId,@RequestParam(required=false) UUID requestingFacilityId,
            @RequestParam(required=false) String requestReasonCode,@RequestParam(required=false) String ownerType,@RequestParam Map<String,String> parameters) {
        if(!Set.of("page","size","status","testingFacilityId","requestingFacilityId","requestReasonCode","ownerType","_csrf").containsAll(parameters.keySet())) throw ApplicationFailure.invalid("Filter permintaan laboratorium tidak dikenal.");
        return queries.list(actor,new Filters(page,size,status,testingFacilityId,requestingFacilityId,requestReasonCode,ownerType));
    }
    @GetMapping("/lab-requests/{requestId}") ResponseEntity<RequestDetail> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID requestId) {
        var response=queries.detail(actor,requestId); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PostMapping("/lab-requests/{requestId}/specimens") ResponseEntity<SpecimenView> specimen(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID requestId,
            @Valid @RequestBody RecordSpecimen input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=requests.specimen(actor,requestId,input,match); return ResponseEntity.status(201).eTag(IfMatch.etag(response.version())).body(response);
    }
    @PostMapping("/lab-specimens/{specimenId}/receive") ResponseEntity<SpecimenView> receive(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID specimenId,
            @Valid @RequestBody ReceiveSpecimen input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=specimens.receive(actor,specimenId,input,match); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PostMapping("/lab-requests/{requestId}/cancel") ResponseEntity<RequestDetail> cancel(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID requestId,@RequestHeader(value="If-Match",required=false) String match) {
        var response=requests.cancel(actor,requestId,match); return ResponseEntity.ok().eTag(IfMatch.etag(response.version())).body(response);
    }
    @PostMapping("/lab-request-tests/{testId}/results") ResponseEntity<ResultResponse> result(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID testId,
            @Valid @RequestBody RecordResult input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=results.record(actor,testId,input,match); return ResponseEntity.status(201).eTag(IfMatch.etag(response.version())).body(response);
    }
    @PostMapping("/lab-results/{resultId}/corrections") ResponseEntity<ResultResponse> correction(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID resultId,
            @Valid @RequestBody CorrectResult input,@RequestHeader(value="If-Match",required=false) String match) {
        var response=results.correct(actor,resultId,input,match); return ResponseEntity.status(201).eTag(IfMatch.etag(response.version())).body(response);
    }
}
