package id.tbcall.web;

import id.tbcall.application.treatment.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.treatment.TreatmentDtos.*;

@RestController
@RequestMapping("/api/v1")
public class TreatmentController {
    private final TreatmentService treatments; private final AdherenceService adherence; private final FollowUpService followUps; private final AdverseEventService adverse; private final TreatmentQueryService queries;
    public TreatmentController(TreatmentService treatments,AdherenceService adherence,FollowUpService followUps,AdverseEventService adverse,TreatmentQueryService queries) { this.treatments=treatments; this.adherence=adherence; this.followUps=followUps; this.adverse=adverse; this.queries=queries; }
    @PostMapping("/cases/{caseId}/treatments") ResponseEntity<TreatmentDetail> start(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@Valid @RequestBody StartInput input) {
        var result=treatments.start(actor,caseId,input); return ResponseEntity.status(201).eTag(IfMatch.etag(result.version())).body(result);
    }
    @GetMapping("/cases/{caseId}/treatments") List<TreatmentDetail> list(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId) { return queries.caseTreatments(actor,caseId); }
    @GetMapping("/treatments/{treatmentId}") ResponseEntity<TreatmentDetail> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId) {
        var result=queries.staff(actor,treatmentId); return ResponseEntity.ok().eTag(IfMatch.etag(result.version())).body(result);
    }
    @PatchMapping("/treatments/{treatmentId}") ResponseEntity<TreatmentDetail> update(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@Valid @RequestBody MetadataInput input,@RequestHeader(value="If-Match",required=false) String match) {
        var result=treatments.update(actor,treatmentId,input,match); return ResponseEntity.ok().eTag(IfMatch.etag(result.version())).body(result);
    }
    @PostMapping("/treatments/{treatmentId}/dose-events") ResponseEntity<DoseView> staffDose(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@Valid @RequestBody DoseInput input) { return ResponseEntity.status(201).body(adherence.staff(actor,treatmentId,input)); }
    @GetMapping("/treatments/{treatmentId}/dose-events") DosePage<DoseView> staffDoses(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.staffDoses(actor,treatmentId,page,size); }
    @PostMapping("/me/treatment/dose-events") ResponseEntity<SafeDose> patientDose(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody DoseInput input) { return ResponseEntity.status(201).body(adherence.patient(actor,input)); }
    @GetMapping("/me/treatment/dose-events") DosePage<SafeDose> patientDoses(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.patientDoses(actor,page,size); }
    @PostMapping("/me/supporting-cases/{caseId}/dose-events") ResponseEntity<SafeDose> supporterDose(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@Valid @RequestBody DoseInput input) { return ResponseEntity.status(201).body(adherence.supporter(actor,caseId,input)); }
    @GetMapping("/me/supporting-cases/{caseId}/dose-events") DosePage<SafeDose> supporterDoses(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return queries.supporterDoses(actor,caseId,page,size); }
    @PostMapping("/treatments/{treatmentId}/follow-ups") ResponseEntity<FollowUpView> schedule(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@Valid @RequestBody ScheduleInput input,@RequestHeader(value="If-Match",required=false) String match) {
        var result=followUps.schedule(actor,treatmentId,input,match); return ResponseEntity.status(201).eTag(IfMatch.etag(result.version())).body(result);
    }
    @PostMapping("/follow-ups/{followUpId}/complete") ResponseEntity<FollowUpView> complete(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID followUpId,@Valid @RequestBody CompleteInput input,@RequestHeader(value="If-Match",required=false) String match) {
        var result=followUps.complete(actor,followUpId,input,match); return ResponseEntity.ok().eTag(IfMatch.etag(result.version())).body(result);
    }
    @GetMapping("/me/follow-ups") List<SafeFollowUp> follows(@AuthenticationPrincipal CurrentActor actor) { return queries.follows(actor); }
    @PostMapping("/treatments/{treatmentId}/adverse-events") ResponseEntity<AdverseView> adverse(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@Valid @RequestBody AdverseInput input) {
        var result=adverse.create(actor,treatmentId,input); return ResponseEntity.status(201).eTag(IfMatch.etag(result.version())).body(result);
    }
    @PatchMapping("/adverse-events/{eventId}") ResponseEntity<AdverseView> updateAdverse(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID eventId,@Valid @RequestBody AdverseUpdate input,@RequestHeader(value="If-Match",required=false) String match) {
        var result=adverse.update(actor,eventId,input,match); return ResponseEntity.ok().eTag(IfMatch.etag(result.version())).body(result);
    }
    @PostMapping("/treatments/{treatmentId}/outcome") ResponseEntity<OutcomeView> outcome(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@Valid @RequestBody OutcomeInput input,@RequestHeader(value="If-Match",required=false) String match) { return ResponseEntity.status(201).body(treatments.outcome(actor,treatmentId,input,match)); }
    @GetMapping("/me/treatment") PatientTreatment patient(@AuthenticationPrincipal CurrentActor actor) { return queries.patient(actor); }
    @GetMapping("/me/supporting-cases/{caseId}/treatment") SupporterTreatment supporter(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId) { return queries.supporter(actor,caseId); }
}
