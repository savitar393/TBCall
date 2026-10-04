package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeReferralSourceAuthorityPolicy implements ReferralSourceAuthorityPolicy {
    private final ScopePolicies scopes;
    public PrototypeReferralSourceAuthorityPolicy(ScopePolicies scopes) { this.scopes=scopes; }
    public void requireLocalCreate(CurrentActor actor,String permission,UUID facilityId,UUID caseId) {
        if(!scopes.officerFacility(actor,permission,facilityId)) throw ApplicationFailure.forbidden();
    }
    public void requireLocalTransition(CurrentActor actor,String permission,UUID facilityId,UUID referralId) {
        if(!scopes.officerFacility(actor,permission,facilityId)) throw ApplicationFailure.forbidden();
        // Prototype records are local. No guessed external ownership or SITB write-back.
    }
}
