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
public class MonitoringController {
    private final MonitoringService service; private final MonitoringQueryService queries;
    public MonitoringController(MonitoringService service,MonitoringQueryService queries) { this.service=service; this.queries=queries; }
    @PostMapping("/treatments/{id}/monitoring-plans") ResponseEntity<PlanDetail> treatmentCreate(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody PlanInput input) { return plan(service.create(actor,id,false,input),201); }
    @PostMapping("/preventive-treatments/{id}/monitoring-plans") ResponseEntity<PlanDetail> tptCreate(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody PlanInput input) { return plan(service.create(actor,id,true,input),201); }
    @GetMapping("/treatments/{id}/monitoring-plans") Page<PlanDetail> treatmentHistory(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.history(actor,id,false,page,size); }
    @GetMapping("/preventive-treatments/{id}/monitoring-plans") Page<PlanDetail> tptHistory(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.history(actor,id,true,page,size); }
    @GetMapping("/monitoring-plans/{id}") ResponseEntity<PlanDetail> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id) { return plan(queries.plan(actor,id),200); }
    @PatchMapping("/monitoring-plans/{id}") ResponseEntity<PlanDetail> patch(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody PlanPatch input,@RequestHeader(value="If-Match",required=false) String match) { return plan(service.patch(actor,id,input,match),200); }
    @PostMapping("/monitoring-plans/{id}/cancel") ResponseEntity<PlanDetail> cancel(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EmptyInput input,@RequestHeader(value="If-Match",required=false) String match) { return plan(service.cancelPlan(actor,id,match),200); }
    @GetMapping("/monitoring-plans/{id}/events") Page<EventDetail> events(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.events(actor,id,page,size); }
    @PostMapping("/monitoring-plans/{id}/events") ResponseEntity<EventDetail> add(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EventInput input,@RequestHeader(value="If-Match",required=false) String match) { return event(service.addEvent(actor,id,input,match),201); }
    @GetMapping("/monitoring-events/{id}") ResponseEntity<EventDetail> eventDetail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id) { return event(queries.event(actor,id),200); }
    @PatchMapping("/monitoring-events/{id}") ResponseEntity<EventDetail> reschedule(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EventPatch input,@RequestHeader(value="If-Match",required=false) String match) { return event(service.reschedule(actor,id,input,match),200); }
    @PostMapping("/monitoring-events/{id}/complete") ResponseEntity<EventDetail> complete(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody CompletionInput input,@RequestHeader(value="If-Match",required=false) String match) { return event(service.complete(actor,id,input,match),200); }
    @PostMapping("/monitoring-events/{id}/cancel") ResponseEntity<EventDetail> cancelEvent(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EmptyInput input,@RequestHeader(value="If-Match",required=false) String match) { return event(service.cancelEvent(actor,id,match),200); }
    @GetMapping("/me/monitoring") Page<SafeEvent> self(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.selfEvents(actor,page,size); }
    @GetMapping("/me/supporting-cases/{caseId}/monitoring") Page<SafeEvent> supporting(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.supportingEvents(actor,caseId,page,size); }
    private ResponseEntity<PlanDetail> plan(PlanDetail value,int status) { return ResponseEntity.status(status).eTag(IfMatch.etag(value.version())).body(value); }
    private ResponseEntity<EventDetail> event(EventDetail value,int status) { return ResponseEntity.status(status).eTag(IfMatch.etag(value.version())).body(value); }
}
