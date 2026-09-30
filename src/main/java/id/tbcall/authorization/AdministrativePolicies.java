package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class AdministrativePolicies {
    private final AuditService audit;
    public AdministrativePolicies(AuditService audit) { this.audit=audit; }
    public void requireSystem(CurrentActor actor, String permission) {
        if (!actor.hasRole("SYSTEM_ADMIN") || !actor.permissions().contains(permission)) denied(actor);
    }
    public void requireUserLookup(CurrentActor actor) {
        if (!actor.permissions().contains("USER_MANAGE_FACILITY") || !(actor.hasRole("SYSTEM_ADMIN")
                || (actor.hasRole("FACILITY_ADMIN") && !actor.facilityIds().isEmpty()))) denied(actor);
    }
    public void requireFacilityMembership(CurrentActor actor, UUID facility) {
        if (!actor.permissions().contains("USER_MANAGE_FACILITY") || !(actor.hasRole("SYSTEM_ADMIN")
                || (actor.hasRole("FACILITY_ADMIN") && actor.facilityIds().contains(facility)))) denied(actor);
    }
    private void denied(CurrentActor actor) {
        audit.authorizationDenied(actor.userId());
        throw ApplicationFailure.forbidden();
    }
}
