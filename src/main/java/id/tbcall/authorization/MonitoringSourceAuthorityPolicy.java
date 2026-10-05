package id.tbcall.authorization;

import java.util.UUID;

public interface MonitoringSourceAuthorityPolicy {
    void requireLocalManage(CurrentActor actor,String permission,UUID facilityId,UUID monitoringPlanId);
}
