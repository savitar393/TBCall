package id.tbcall.web;

import id.tbcall.application.portal.PortalReferenceDtos.ReferenceData;
import id.tbcall.application.portal.PortalReferenceService;
import id.tbcall.authorization.CurrentActor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class PortalReferenceController {
    private final PortalReferenceService references;

    public PortalReferenceController(PortalReferenceService references) {
        this.references = references;
    }

    @GetMapping("/portal-reference-data")
    ReferenceData referenceData(@AuthenticationPrincipal CurrentActor actor) {
        return references.referenceData(actor);
    }
}
