package id.tbcall.web;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.reminder.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/webhooks/whatsapp")
public class WhatsAppWebhookController {
    private final MetaReminderSafety safety;
    private final MetaWhatsAppProperties meta;
    private final MetaReminderService service;
    public WhatsAppWebhookController(MetaReminderSafety safety,MetaWhatsAppProperties meta,MetaReminderService service){this.safety=safety;this.meta=meta;this.service=service;}
    @GetMapping ResponseEntity<String> verify(HttpServletRequest request){
        safety.requireTest();
        String mode=one(request,"hub.mode"),token=one(request,"hub.verify_token"),challenge=one(request,"hub.challenge");
        if(!"subscribe".equals(mode) || token==null || challenge==null || !challenge.matches("[\\x20-\\x7e]{1,512}")
                || !MessageDigest.isEqual(meta.getVerifyToken().getBytes(StandardCharsets.UTF_8),token.getBytes(StandardCharsets.UTF_8)))throw rejected();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.TEXT_PLAIN).body(challenge);
    }
    @PostMapping(consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Void> receive(HttpServletRequest request) throws IOException {
        safety.requireTest();
        if(request.getHeader("Content-Encoding")!=null && !"identity".equalsIgnoreCase(request.getHeader("Content-Encoding")))throw rejected();
        var signatures=Collections.list(request.getHeaders("X-Hub-Signature-256"));
        if(signatures.size()!=1)throw rejected();
        if(request.getContentLengthLong()>262144)throw tooLarge();
        byte[] raw=request.getInputStream().readNBytes(262145);
        if(raw.length>262144)throw tooLarge();
        service.callback(raw,Map.of("X-Hub-Signature-256",signatures.getFirst()));
        // Meta legitimately redelivers events; duplicates have no repeated effects and are acknowledged.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).build();
    }
    private String one(HttpServletRequest request,String key){var values=request.getParameterValues(key);return values!=null && values.length==1?values[0]:null;}
    private ApplicationFailure rejected(){return new ApplicationFailure(403,"WEBHOOK_REJECTED","Permintaan ditolak","Webhook tidak valid.");}
    private ApplicationFailure tooLarge(){return new ApplicationFailure(413,"WEBHOOK_TOO_LARGE","Permintaan ditolak","Ukuran webhook melampaui batas.");}
}
