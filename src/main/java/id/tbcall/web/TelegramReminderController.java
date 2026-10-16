package id.tbcall.web;

import id.tbcall.application.reminder.TelegramLinkService;
import id.tbcall.authorization.CurrentActor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/me/medication-reminders/telegram")
public class TelegramReminderController {
    private final TelegramLinkService service;
    public TelegramReminderController(TelegramLinkService service){this.service=service;}
    @GetMapping ResponseEntity<TelegramLinkService.Status> read(@AuthenticationPrincipal CurrentActor actor){return status(service.read(actor));}
    @PostMapping("/link") ResponseEntity<TelegramLinkService.LinkIntent> link(@AuthenticationPrincipal CurrentActor actor,@RequestHeader(value="If-Match",required=false) String match){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.create(actor,match));}
    @DeleteMapping ResponseEntity<TelegramLinkService.Status> unlink(@AuthenticationPrincipal CurrentActor actor,@RequestHeader(value="If-Match",required=false) String match){return status(service.unlink(actor,match));}
    private ResponseEntity<TelegramLinkService.Status> status(TelegramLinkService.Status value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag(value.etag()).body(value);}
}
