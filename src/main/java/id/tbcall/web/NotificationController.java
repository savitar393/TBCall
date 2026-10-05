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
@RequestMapping("/api/v1/me/notifications")
public class NotificationController {
    private final NotificationService service; private final MonitoringQueryService queries;
    public NotificationController(NotificationService service,MonitoringQueryService queries) { this.service=service; this.queries=queries; }
    @GetMapping Page<NotificationDetail> list(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.notifications(actor,page,size); }
    @PostMapping("/{id}/read") ResponseEntity<NotificationDetail> read(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody EmptyInput input,@RequestHeader(value="If-Match",required=false) String match) { var n=service.read(actor,id,match); return ResponseEntity.ok().eTag(IfMatch.etag(n.version())).body(n); }
}
