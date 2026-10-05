package id.tbcall.web;

import id.tbcall.application.monitoring.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.monitoring.MonitoringDtos.*;

@RestController
@RequestMapping("/api/v1")
public class AlertController {
    private final AlertService service; private final MonitoringQueryService queries;
    public AlertController(AlertService service,MonitoringQueryService queries) { this.service=service; this.queries=queries; }
    @GetMapping("/alerts") Page<AlertDetail> list(@AuthenticationPrincipal CurrentActor actor,@RequestParam(required=false) String status,@RequestParam(required=false) String targetType,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.alerts(actor,status,targetType,page,size); }
    @GetMapping("/alerts/{id}") ResponseEntity<AlertDetail> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id) { return response(queries.alert(actor,id)); }
    @PostMapping("/alerts/{id}/acknowledge") ResponseEntity<AlertDetail> acknowledge(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EmptyInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.acknowledge(actor,id,match)); }
    @PostMapping("/alerts/{id}/resolve") ResponseEntity<AlertDetail> resolve(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EmptyInput input,@RequestHeader(value="If-Match",required=false) String match) { return response(service.resolve(actor,id,match)); }
    @GetMapping("/me/alerts") Page<SafeAlert> self(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.selfAlerts(actor,page,size); }
    @PostMapping("/me/alerts/{id}/acknowledge") SafeAlert selfReceipt(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EmptyInput input) { return service.selfReceipt(actor,id); }
    @GetMapping("/me/supporting-cases/{caseId}/alerts") Page<SafeAlert> supporting(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.supportingAlerts(actor,caseId,page,size); }
    @PostMapping("/me/supporting-cases/{caseId}/alerts/{id}/acknowledge") SafeAlert supporterReceipt(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@PathVariable UUID id,@Valid @RequestBody EmptyInput input) { return service.supporterReceipt(actor,caseId,id); }
    private ResponseEntity<AlertDetail> response(AlertDetail value) { return ResponseEntity.ok().eTag(IfMatch.etag(value.version())).body(value); }
}
