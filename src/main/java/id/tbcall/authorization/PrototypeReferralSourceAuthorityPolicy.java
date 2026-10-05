package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeReferralSourceAuthorityPolicy implements ReferralSourceAuthorityPolicy {
    private final ScopePolicies scopes;
    private final ExternalAuthorityRegistry authorities;
    public PrototypeReferralSourceAuthorityPolicy(ScopePolicies scopes,ExternalAuthorityRegistry authorities) { this.scopes=scopes; this.authorities=authorities; }
    public void requireLocalCreate(CurrentActor actor,String permission,UUID facilityId,UUID caseId) {
        if(!scopes.officerFacility(actor,permission,facilityId)) throw ApplicationFailure.forbidden();
    }
    public void requireLocalTransition(CurrentActor actor,String permission,UUID facilityId,UUID referralId) {
        if(!scopes.officerFacility(actor,permission,facilityId)) throw ApplicationFailure.forbidden();
        authorities.requireLocallyWritable("REFERRAL",referralId,"REFERRAL");
    }
}
