package id.tbcall.web;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.reporting.*;
import id.tbcall.authorization.CurrentActor;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.reporting.ReportingDtos.*;

@RestController @RequestMapping("/api/v1/program-reports")
public class ProgramReportController {
    private final ProgramReportService reports;
    public ProgramReportController(ProgramReportService reports) { this.reports=reports; }
    @GetMapping("/summary") ResponseEntity<Summary> summary(@AuthenticationPrincipal CurrentActor actor,@RequestParam MultiValueMap<String,String> params) {
        validate(params); return response(reports.summary(actor,params.getFirst("scope"),params.getFirst("regionCode")));
    }
    @GetMapping("/breakdown") ResponseEntity<Breakdown> breakdown(@AuthenticationPrincipal CurrentActor actor,@RequestParam MultiValueMap<String,String> params) {
        validate(params); return response(reports.breakdown(actor,params.getFirst("scope"),params.getFirst("regionCode")));
    }
    @GetMapping("/metadata") ResponseEntity<Metadata> metadata(@AuthenticationPrincipal CurrentActor actor,@RequestParam MultiValueMap<String,String> params) {
        validate(params); return response(reports.metadata(actor,params.getFirst("scope"),params.getFirst("regionCode")));
    }
    private void validate(MultiValueMap<String,String> params) {
        if(!Set.of("scope","regionCode","_csrf").containsAll(params.keySet())
                || params.values().stream().anyMatch(values -> values.size()!=1))
            throw ApplicationFailure.invalid("Filter laporan tidak dikenal atau berulang.");
    }
    private <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
}
