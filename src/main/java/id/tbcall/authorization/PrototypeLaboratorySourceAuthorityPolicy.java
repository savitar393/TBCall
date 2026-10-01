package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeLaboratorySourceAuthorityPolicy implements LaboratorySourceAuthorityPolicy {
    public void requireLocalCreate(CurrentActor actor,String permission,UUID facilityId,String resourceType) { require(actor,permission,facilityId); }
    public void requireLocalEdit(CurrentActor actor,String permission,UUID facilityId,String resourceType,UUID resourceId) { require(actor,permission,facilityId); }
    private void require(CurrentActor actor,String permission,UUID facilityId) {
        boolean role="LAB_REQUEST_WRITE".equals(permission) ? actor.hasRole("TB_OFFICER")
                : "LAB_RESULT_WRITE".equals(permission) && actor.hasRole("LAB_STAFF");
        if(!role || !actor.permissions().contains(permission) || !actor.facilityIds().contains(facilityId)) throw ApplicationFailure.forbidden();
        // Local prototype only; no guessed SITB ownership, API or write-back behavior.
    }
}
