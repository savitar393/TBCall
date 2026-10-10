package id.tbcall.web;

import id.tbcall.application.clinical.*;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/cases")
public class CaseSummaryController {
    private final CaseSummaryService summaries;
    public CaseSummaryController(CaseSummaryService summaries) { this.summaries=summaries; }
    @GetMapping("/{caseId}/summary") CaseSummaryDtos.Summary summary(@AuthenticationPrincipal CurrentActor actor,@PathVariable UUID caseId,
            @RequestParam(defaultValue="0") int diagnosisPage,@RequestParam(defaultValue="0") int labPage,
            @RequestParam(defaultValue="0") int treatmentPage,@RequestParam Map<String,String> parameters) {
        if(!Set.of("diagnosisPage","labPage","treatmentPage","_csrf").containsAll(parameters.keySet())) throw ApplicationFailure.invalid("Filter ringkasan tidak dikenal.");
        return summaries.read(actor,caseId,diagnosisPage,labPage,treatmentPage);
    }
}
