package id.tbcall.web;

import id.tbcall.application.clinical.ClinicalDirectoryService;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import java.util.Map;
import java.util.Set;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.clinical.ClinicalDirectoryDtos.*;

@RestController
@RequestMapping("/api/v1")
public class ClinicalDirectoryController {
    private final ClinicalDirectoryService directory;
    public ClinicalDirectoryController(ClinicalDirectoryService directory) { this.directory=directory; }
    @GetMapping("/clinical-reference-data") ReferenceData references(@AuthenticationPrincipal CurrentActor actor) { return directory.referenceData(actor); }
    @GetMapping("/clinical-facilities") FacilityPage facilities(@AuthenticationPrincipal CurrentActor actor,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
            @RequestParam(required=false) String query,@RequestParam Map<String,String> parameters) {
        // _csrf is Spring Security's existing token parameter, not a directory filter.
        if(!Set.of("page","size","query","_csrf").containsAll(parameters.keySet()))
            throw ApplicationFailure.invalid("Filter direktori fasyankes tidak dikenal.");
        return directory.facilities(actor,page,size,query);
    }
}
