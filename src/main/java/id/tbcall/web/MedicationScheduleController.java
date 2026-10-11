package id.tbcall.web;

import id.tbcall.application.treatment.MedicationScheduleService;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.treatment.MedicationScheduleDtos.*;

@RestController @RequestMapping("/api/v1")
public class MedicationScheduleController {
    private final MedicationScheduleService service;
    public MedicationScheduleController(MedicationScheduleService service){this.service=service;}
    @PostMapping("/treatments/{treatmentId}/medication-schedule")
    ResponseEntity<Prescription> create(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@Valid @RequestBody Definition input){return response(service.create(actor,treatmentId,input),201);}
    @PatchMapping("/treatments/{treatmentId}/medication-schedule")
    ResponseEntity<Prescription> revise(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@Valid @RequestBody Definition input,@RequestHeader(value="If-Match",required=false) String match){return response(service.revise(actor,treatmentId,input,match),200);}
    @PostMapping("/treatments/{treatmentId}/medication-schedule/cancel")
    ResponseEntity<Prescription> cancel(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@RequestHeader(value="If-Match",required=false) String match){return response(service.cancel(actor,treatmentId,match),200);}
    @GetMapping("/treatments/{treatmentId}/medication-schedule")
    ResponseEntity<Prescription> staff(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId){return response(service.staff(actor,treatmentId),200);}
    @GetMapping("/treatments/{treatmentId}/medication-schedule/revisions")
    RevisionPage history(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.history(actor,treatmentId,page,size);}
    @GetMapping("/treatments/{treatmentId}/medication-schedule/occurrences")
    CalendarPage staffCalendar(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID treatmentId,@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to){return service.staffCalendar(actor,treatmentId,from,to);}
    @GetMapping("/me/treatment/medication-schedule")
    Prescription patient(@AuthenticationPrincipal CurrentActor actor){return service.patient(actor);}
    @GetMapping("/me/treatment/medication-schedule/occurrences")
    CalendarPage patientCalendar(@AuthenticationPrincipal CurrentActor actor,@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to){return service.patientCalendar(actor,from,to);}
    @GetMapping("/me/supporting-cases/{caseId}/medication-schedule")
    Prescription supporter(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId){return service.supporter(actor,caseId);}
    @GetMapping("/me/supporting-cases/{caseId}/medication-schedule/occurrences")
    CalendarPage supporterCalendar(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to){return service.supporterCalendar(actor,caseId,from,to);}
    private ResponseEntity<Prescription> response(Prescription p,int status){var builder=ResponseEntity.status(status);if(p.version()!=null)builder.eTag(IfMatch.etag(p.version()));return builder.body(p);}
}
