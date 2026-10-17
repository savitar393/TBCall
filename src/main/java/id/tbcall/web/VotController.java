package id.tbcall.web;

import id.tbcall.application.vot.*;
import id.tbcall.authorization.CurrentActor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.UUID;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.vot.VotDtos.*;

@RestController @RequestMapping("/api/v1")
public class VotController {
    private final VotService service;
    public VotController(VotService service){this.service=service;}
    @GetMapping("/me/vot-policy") Policy policy(@AuthenticationPrincipal CurrentActor actor){return service.policy(actor);}
    @PostMapping("/me/vot-submissions")
    ResponseEntity<Submission> submit(@AuthenticationPrincipal CurrentActor actor,@RequestParam UUID treatmentId,@RequestParam String occurrenceId,
            @RequestParam boolean consentAcknowledged,@RequestParam String consentPolicyVersion,HttpServletRequest request)throws IOException{
        return response(service.submit(actor,treatmentId,occurrenceId,consentAcknowledged,consentPolicyVersion,request.getInputStream(),request.getContentType(),request.getContentLengthLong()),201);
    }
    @GetMapping("/me/vot-submissions") Page mine(@AuthenticationPrincipal CurrentActor actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.patientList(actor,page,size);}
    @GetMapping("/me/vot-submissions/{id}") ResponseEntity<Submission> mine(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id){return response(service.patientDetail(actor,id),200);}
    @PostMapping("/me/vot-submissions/{id}/cancel") ResponseEntity<Submission> cancel(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match){return response(service.cancel(actor,id,match),200);}
    @GetMapping({"/vot-submissions","/treatments/{treatmentId}/vot-submissions"})
    Page queue(@AuthenticationPrincipal CurrentActor actor,@PathVariable(required=false) UUID treatmentId,@RequestParam(name="treatmentId",required=false) UUID treatmentIdFilter,
            @RequestParam(required=false) String status,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.staffList(actor,treatmentId!=null?treatmentId:treatmentIdFilter,status,page,size);}
    @GetMapping("/vot-submissions/{id}") ResponseEntity<Submission> detail(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id){return response(service.staffDetail(actor,id),200);}
    @PostMapping("/vot-submissions/{id}/review") ResponseEntity<Submission> review(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id,@Valid @RequestBody Review input,@RequestHeader(value="If-Match",required=false) String match){return response(service.review(actor,id,input,match),200);}
    @GetMapping("/me/vot-submissions/{id}/media") ResponseEntity<InputStreamResource> mineMedia(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id){return media(service.media(actor,id,true));}
    @GetMapping("/vot-submissions/{id}/media") ResponseEntity<InputStreamResource> staffMedia(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID id){return media(service.media(actor,id,false));}
    private ResponseEntity<Submission> response(Submission body,int status){return ResponseEntity.status(status).eTag(IfMatch.etag(body.version())).cacheControl(CacheControl.noStore()).body(body);}
    private ResponseEntity<InputStreamResource> media(VotService.Media media){return ResponseEntity.ok().contentType(MediaType.parseMediaType(media.contentType())).contentLength(media.size())
            .header("Cache-Control","no-store, private").header("Pragma","no-cache").header("X-Content-Type-Options","nosniff").header("Content-Disposition","inline").header("Accept-Ranges","none")
            .body(new InputStreamResource(media.stream()));}
}
