package id.tbcall.web;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.dashboard.*;
import id.tbcall.authorization.CurrentActor;
import java.util.Map;
import java.util.Set;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/operational-dashboard")
public class OperationalDashboardController {
    private final OperationalDashboardService dashboard;
    public OperationalDashboardController(OperationalDashboardService dashboard) { this.dashboard=dashboard; }
    @GetMapping DashboardDtos.Dashboard read(@AuthenticationPrincipal CurrentActor actor,
            @RequestParam(defaultValue="0") int upcomingPage,@RequestParam(defaultValue="0") int overduePage,
            @RequestParam(defaultValue="0") int labPage,@RequestParam Map<String,String> parameters) {
        if(!Set.of("upcomingPage","overduePage","labPage","_csrf").containsAll(parameters.keySet())) throw ApplicationFailure.invalid("Filter dashboard tidak dikenal.");
        return dashboard.read(actor,upcomingPage,overduePage,labPage);
    }
}
