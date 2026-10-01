package id.tbcall.authorization;

import java.util.UUID;

/** Laboratory source authority is independent of clinical source authority. */
public interface LaboratorySourceAuthorityPolicy {
    void requireLocalCreate(CurrentActor actor,String permission,UUID facilityId,String resourceType);
    void requireLocalEdit(CurrentActor actor,String permission,UUID facilityId,String resourceType,UUID resourceId);
}
