package id.tbcall.authorization;

import java.util.UUID;

/** Referral authority is checked after actor and facility scope, under the parent locks. */
public interface ReferralSourceAuthorityPolicy {
    void requireLocalCreate(CurrentActor actor,String permission,UUID facilityId,UUID caseId);
    void requireLocalTransition(CurrentActor actor,String permission,UUID facilityId,UUID referralId);
}
