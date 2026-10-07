package id.tbcall.web;

import id.tbcall.application.treatment.TreatmentReferenceDtos.ReferenceData;
import id.tbcall.application.treatment.TreatmentReferenceService;
import id.tbcall.authorization.CurrentActor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class TreatmentReferenceController {
    private final TreatmentReferenceService references;

    public TreatmentReferenceController(TreatmentReferenceService references) {
        this.references=references;
    }

    @GetMapping("/treatment-reference-data")
    ReferenceData referenceData(@AuthenticationPrincipal CurrentActor actor) {
        return references.referenceData(actor);
    }
}
