package id.tbcall.web;

import id.tbcall.application.reminder.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Exact manual test operations; all existing authentication and CSRF checks apply. */
@RestController @RequestMapping("/api/v1/admin/medication-reminders")
public class ChannelReminderTestController {
    private final ChannelReminderService service;private final TelegramPollService telegram;
    public ChannelReminderTestController(ChannelReminderService service,TelegramPollService telegram){this.service=service;this.telegram=telegram;}
    @PostMapping("/channel-test-plan") MedicationReminderTestController.Planned plan(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody MedicationReminderTestController.Plan input){return new MedicationReminderTestController.Planned(service.plan(actor,input.confirmTestOperation()));}
    @PostMapping("/channel-test-dispatch") MedicationReminderTestController.Dispatched dispatch(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody MedicationReminderTestController.Dispatch input){return new MedicationReminderTestController.Dispatched(service.dispatch(actor,input.jobId(),input.confirmTestOperation()));}
    public record Polled(int processed){}
    @PostMapping("/channel-test-telegram-poll") Polled poll(@AuthenticationPrincipal CurrentActor actor,@Valid @RequestBody MedicationReminderTestController.Plan input){return new Polled(telegram.poll(actor,input.confirmTestOperation()));}
}
