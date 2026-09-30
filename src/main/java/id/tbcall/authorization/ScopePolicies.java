package id.tbcall.authorization;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.persistence.entity.LabRequest;
import id.tbcall.persistence.entity.TBCase;
import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional(readOnly=true)
public class ScopePolicies {
    private final EntityManager em;
    private final AuditService audit;
    public ScopePolicies(EntityManager em, AuditService audit) { this.em = em; this.audit = audit; }
    public boolean officerFacility(CurrentActor actor, String permission, UUID facility) {
        return actor.hasRole("TB_OFFICER") && actor.permissions().contains(permission) && actor.facilityIds().contains(facility);
    }
    public void requireOfficerPatientLinkScope(CurrentActor actor, String permission, UUID patient) {
        if (!actor.hasRole("TB_OFFICER") || !actor.permissions().contains(permission) || actor.facilityIds().isEmpty()) denied(actor);
        long registrations = em.createQuery("""
                select count(r) from TBRegistration r where r.patient.id=:patient and r.facility.id in :facilities
                """, Long.class).setParameter("patient", patient).setParameter("facilities", actor.facilityIds()).getSingleResult();
        long cases = em.createQuery("""
                select count(c) from TBCase c where c.registration.patient.id=:patient and c.currentFacility.id in :facilities
                """, Long.class).setParameter("patient", patient).setParameter("facilities", actor.facilityIds()).getSingleResult();
        if (registrations == 0 && cases == 0) denied(actor);
    }
    public void requireOfficerClinicalPatientScope(CurrentActor actor, String permission, UUID patient) {
        if (!actor.hasRole("TB_OFFICER") || !actor.permissions().contains(permission) || actor.facilityIds().isEmpty()) denied(actor);
        long registrations=em.createQuery("""
                select count(r) from TBRegistration r where r.patient.id=:patient and r.facility.id in :facilities
                and r.status in ('OPEN','DIAGNOSED')
                """, Long.class).setParameter("patient", patient).setParameter("facilities", actor.facilityIds()).getSingleResult();
        long cases=em.createQuery("""
                select count(c) from TBCase c where c.registration.patient.id=:patient and c.currentFacility.id in :facilities
                and c.status in ('ACTIVE','REFERRED')
                """, Long.class).setParameter("patient", patient).setParameter("facilities", actor.facilityIds()).getSingleResult();
        if (registrations==0 && cases==0) denied(actor);
    }
    public void requireOfficerCase(CurrentActor actor, String permission, TBCase tbCase) {
        if (!officerFacility(actor, permission, tbCase.getCurrentFacility().getId())) denied(actor);
    }
    public boolean patientSelf(CurrentActor actor, String permission, UUID patient) {
        return actor.hasRole("PATIENT") && actor.permissions().contains(permission) && patient.equals(actor.selfPatientId());
    }
    public boolean supporterCase(CurrentActor actor, String permission, UUID tbCase) {
        return actor.hasRole("TREATMENT_SUPPORTER") && actor.permissions().contains(permission) && actor.supporterCaseIds().contains(tbCase);
    }
    public boolean labRequest(CurrentActor actor, String permission, LabRequest request) {
        return actor.hasRole("LAB_STAFF") && actor.permissions().contains(permission)
                && actor.facilityIds().contains(request.getTestingFacility().getId());
    }
    private void denied(CurrentActor actor) {
        audit.authorizationDenied(actor.userId());
        throw ApplicationFailure.forbidden();
    }
}
