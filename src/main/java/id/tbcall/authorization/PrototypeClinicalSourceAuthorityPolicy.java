package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeClinicalSourceAuthorityPolicy implements ClinicalSourceAuthorityPolicy {
    private final ScopePolicies scopes;
    private final ExternalAuthorityRegistry authorities;
    public PrototypeClinicalSourceAuthorityPolicy(ScopePolicies scopes, ExternalAuthorityRegistry authorities) {
        this.scopes = scopes; this.authorities = authorities;
    }
    public void requireLocalCreate(CurrentActor actor, String permission, UUID facilityId, String resourceType) {
        if (!scopes.officerFacility(actor, permission, facilityId)) throw ApplicationFailure.forbidden();
    }
    public void requireLocalEdit(CurrentActor actor, String permission, UUID facilityId, String resourceType, UUID resourceId) {
        if (!scopes.officerFacility(actor, permission, facilityId)) throw ApplicationFailure.forbidden();
        authorities.requireLocallyWritable(resourceType, resourceId, "CLINICAL");
    }
}
