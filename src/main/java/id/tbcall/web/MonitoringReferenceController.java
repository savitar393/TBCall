package id.tbcall.web;

import id.tbcall.application.monitoring.MonitoringReferenceDtos.ReferenceData;
import id.tbcall.application.monitoring.MonitoringReferenceService;
import id.tbcall.authorization.CurrentActor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class MonitoringReferenceController {
    private final MonitoringReferenceService references;

    public MonitoringReferenceController(MonitoringReferenceService references) {
        this.references=references;
    }

    @GetMapping("/monitoring-reference-data")
    ReferenceData referenceData(@AuthenticationPrincipal CurrentActor actor) {
        return references.referenceData(actor);
    }
}
