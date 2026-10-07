package id.tbcall.web;

import id.tbcall.application.laboratory.LabReferenceService;
import id.tbcall.application.laboratory.LabReferenceDtos.ReferenceData;
import id.tbcall.authorization.CurrentActor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class LaboratoryReferenceController {
    private final LabReferenceService references;

    public LaboratoryReferenceController(LabReferenceService references) { this.references=references; }

    @GetMapping("/laboratory-reference-data")
    ReferenceData referenceData(@AuthenticationPrincipal CurrentActor actor) { return references.referenceData(actor); }
}
