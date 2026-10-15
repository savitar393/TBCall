package id.tbcall.web;

import id.tbcall.application.reminder.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.reminder.ReminderDtos.*;

@RestController @RequestMapping("/api/v1/me/medication-reminders")
public class MedicationReminderController {
    private final ReminderPreferencesService service;
    public MedicationReminderController(ReminderPreferencesService service){this.service=service;}
    @GetMapping("/preferences") ResponseEntity<Preferences> read(@AuthenticationPrincipal CurrentActor actor){return response(service.read(actor));}
    @PatchMapping("/preferences") ResponseEntity<Preferences> update(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody Change input,@RequestHeader(value="If-Match",required=false) String match){return response(service.update(actor,input,match));}
    @GetMapping("/history") History history(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size){return service.history(actor,page,size);}
    private ResponseEntity<Preferences> response(Preferences value){return ResponseEntity.ok().eTag(value.etag()).body(value);}
}
