package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeContactSourceAuthorityPolicy implements ContactSourceAuthorityPolicy {
    private final ScopePolicies scopes;
    public PrototypeContactSourceAuthorityPolicy(ScopePolicies scopes) { this.scopes=scopes; }
    public void requireLocalContactWrite(CurrentActor actor,String permission,UUID facilityId,UUID caseId,UUID contactId) { require(actor,permission,facilityId); }
    public void requireLocalInvestigationTransition(CurrentActor actor,String permission,UUID facilityId,UUID investigationId) { require(actor,permission,facilityId); }
    public void requireLocalTptWrite(CurrentActor actor,String permission,UUID facilityId,UUID contactId,UUID preventiveTreatmentId) { require(actor,permission,facilityId); }
    private void require(CurrentActor actor,String permission,UUID facility) {
        if(!scopes.officerFacility(actor,permission,facility)) throw ApplicationFailure.forbidden();
        // Authorized prototype records are local. External ownership/write-back is deferred.
    }
}
