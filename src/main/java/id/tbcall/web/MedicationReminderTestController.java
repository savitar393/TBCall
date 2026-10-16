package id.tbcall.web;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import id.tbcall.application.reminder.MetaReminderService;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Operator-only nonproduction actions. No arbitrary recipient, template or content parameters. */
@RestController @RequestMapping("/api/v1/admin/medication-reminders")
public class MedicationReminderTestController {
    public record Plan(@NotNull Boolean confirmTestOperation){
        @JsonAnySetter public void unsupported(String key,Object value){throw new IllegalArgumentException("Unsupported test parameter");}
    }
    public record Dispatch(@NotNull UUID jobId,@NotNull Boolean confirmTestOperation){
        @JsonAnySetter public void unsupported(String key,Object value){throw new IllegalArgumentException("Unsupported test parameter");}
    }
    public record Planned(int planned){}
    public record Dispatched(boolean admitted){}
    private final MetaReminderService service;
    public MedicationReminderTestController(MetaReminderService service){this.service=service;}
    @PostMapping("/test-plan") Planned plan(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody Plan input){return new Planned(service.plan(actor,input.confirmTestOperation()));}
    @PostMapping("/test-dispatch") Dispatched dispatch(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody Dispatch input){return new Dispatched(service.dispatch(actor,input.jobId(),input.confirmTestOperation()));}
}
