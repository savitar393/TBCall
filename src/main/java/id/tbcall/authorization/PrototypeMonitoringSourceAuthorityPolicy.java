package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeMonitoringSourceAuthorityPolicy implements MonitoringSourceAuthorityPolicy {
    private final ScopePolicies scopes;
    private final ExternalAuthorityRegistry authorities;
    public PrototypeMonitoringSourceAuthorityPolicy(ScopePolicies scopes,ExternalAuthorityRegistry authorities) { this.scopes=scopes; this.authorities=authorities; }
    public void requireLocalManage(CurrentActor actor,String permission,UUID facilityId,UUID monitoringPlanId) {
        if(!scopes.officerFacility(actor,permission,facilityId)) throw ApplicationFailure.forbidden();
        authorities.requireLocallyWritable("MONITORING_PLAN",monitoringPlanId,"MONITORING");
    }
}
