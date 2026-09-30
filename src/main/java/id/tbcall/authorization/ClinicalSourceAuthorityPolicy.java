package id.tbcall.authorization;

import java.util.UUID;

/** Call only after permission/scope authorization. Field names are TBCall canonical names. */
public interface ClinicalSourceAuthorityPolicy {
    void requireLocalEdit(CurrentActor actor, String permission, UUID facilityId, String resourceType, UUID resourceId);
}
