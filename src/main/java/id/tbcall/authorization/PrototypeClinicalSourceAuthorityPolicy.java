package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeClinicalSourceAuthorityPolicy implements ClinicalSourceAuthorityPolicy {
    private final ScopePolicies scopes;
    public PrototypeClinicalSourceAuthorityPolicy(ScopePolicies scopes) { this.scopes = scopes; }
    public void requireLocalCreate(CurrentActor actor, String permission, UUID facilityId, String resourceType) {
        if (!scopes.officerFacility(actor, permission, facilityId)) throw ApplicationFailure.forbidden();
    }
    public void requireLocalEdit(CurrentActor actor, String permission, UUID facilityId, String resourceType, UUID resourceId) {
        if (!scopes.officerFacility(actor, permission, facilityId)) throw ApplicationFailure.forbidden();
        // Prototype records are local. No guessed SITB source ownership or write-back.
    }
}
