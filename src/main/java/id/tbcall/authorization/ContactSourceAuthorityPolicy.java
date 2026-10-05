package id.tbcall.authorization;

import java.util.UUID;

public interface ContactSourceAuthorityPolicy {
    void requireLocalContactWrite(CurrentActor actor,String permission,UUID facilityId,UUID caseId,UUID contactId);
    void requireLocalInvestigationTransition(CurrentActor actor,String permission,UUID facilityId,UUID investigationId);
    void requireLocalTptWrite(CurrentActor actor,String permission,UUID facilityId,UUID contactId,UUID preventiveTreatmentId);
}
