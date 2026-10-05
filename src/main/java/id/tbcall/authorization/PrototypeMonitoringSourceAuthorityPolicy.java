package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeMonitoringSourceAuthorityPolicy implements MonitoringSourceAuthorityPolicy {
    private final ScopePolicies scopes;
    public PrototypeMonitoringSourceAuthorityPolicy(ScopePolicies scopes) { this.scopes=scopes; }
    public void requireLocalManage(CurrentActor actor,String permission,UUID facilityId,UUID monitoringPlanId) {
        if(!scopes.officerFacility(actor,permission,facilityId)) throw ApplicationFailure.forbidden();
        // Operational monitoring is local; this grants no clinical or external write-back authority.
    }
}
