package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class PrototypeContactSourceAuthorityPolicy implements ContactSourceAuthorityPolicy {
    private final ScopePolicies scopes;
    private final ExternalAuthorityRegistry authorities;
    public PrototypeContactSourceAuthorityPolicy(ScopePolicies scopes,ExternalAuthorityRegistry authorities) { this.scopes=scopes; this.authorities=authorities; }
    public void requireLocalContactWrite(CurrentActor actor,String permission,UUID facilityId,UUID caseId,UUID contactId) {
        require(actor,permission,facilityId); authorities.requireLocallyWritable("CONTACT",contactId,"CONTACT_TPT");
    }
    public void requireLocalInvestigationTransition(CurrentActor actor,String permission,UUID facilityId,UUID investigationId) {
        require(actor,permission,facilityId); authorities.requireLocallyWritable("CONTACT_INVESTIGATION",investigationId,"CONTACT_TPT");
    }
    public void requireLocalTptWrite(CurrentActor actor,String permission,UUID facilityId,UUID contactId,UUID preventiveTreatmentId) {
        require(actor,permission,facilityId); authorities.requireLocallyWritable("PREVENTIVE_TREATMENT",preventiveTreatmentId,"CONTACT_TPT");
    }
    private void require(CurrentActor actor,String permission,UUID facility) {
        if(!scopes.officerFacility(actor,permission,facility)) throw ApplicationFailure.forbidden();
    }
}
