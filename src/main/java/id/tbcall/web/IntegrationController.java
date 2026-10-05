package id.tbcall.web;

import id.tbcall.application.integration.IntegrationQueryService;
import id.tbcall.authorization.CurrentActor;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.integration.IntegrationDtos.*;

@RestController
@RequestMapping("/api/v1/integrations")
public class IntegrationController {
    private final IntegrationQueryService queries;
    public IntegrationController(IntegrationQueryService queries) { this.queries = queries; }

    @GetMapping
    Page<IntegrationSummary> list(@AuthenticationPrincipal CurrentActor actor,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return queries.integrations(actor, page, size);
    }
    @GetMapping("/{code}")
    IntegrationSummary detail(@AuthenticationPrincipal CurrentActor actor, @PathVariable String code) {
        return queries.integration(actor, code);
    }
    @GetMapping("/{code}/external-identifiers")
    Page<IdentifierSummary> identifiers(@AuthenticationPrincipal CurrentActor actor, @PathVariable String code,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return queries.identifiers(actor, code, page, size);
    }
    @GetMapping("/{code}/authorities")
    Page<AuthoritySummary> authorities(@AuthenticationPrincipal CurrentActor actor, @PathVariable String code,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return queries.authorities(actor, code, page, size);
    }
    @GetMapping("/{code}/sync-runs")
    Page<RunSummary> runs(@AuthenticationPrincipal CurrentActor actor, @PathVariable String code,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return queries.runs(actor, code, page, size);
    }
    @GetMapping("/{code}/sync-runs/{runId}")
    RunDetail run(@AuthenticationPrincipal CurrentActor actor, @PathVariable String code, @PathVariable UUID runId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return queries.run(actor, code, runId, page, size);
    }
    @GetMapping("/{code}/conflicts")
    Page<ConflictSummary> conflicts(@AuthenticationPrincipal CurrentActor actor, @PathVariable String code,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return queries.conflicts(actor, code, page, size);
    }
}
