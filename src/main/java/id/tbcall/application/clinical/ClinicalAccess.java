package id.tbcall.application.clinical;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class ClinicalAccess {
    public static final String CURRENT_PATIENT="""
            (exists (select r.id from TBRegistration r where r.patient.id=p.id and r.facility.id in :facilities
                and r.facility.active=true and r.status in ('OPEN','DIAGNOSED'))
            or exists (select c.id from TBCase c where c.registration.patient.id=p.id and c.currentFacility.id in :facilities
                and c.currentFacility.active=true and c.status in ('ACTIVE','REFERRED')))
            """;
    private final EntityManager em;
    private final AuditService audit;
    public ClinicalAccess(EntityManager em,AuditService audit) { this.em=em; this.audit=audit; }
    public void officer(CurrentActor actor,String permission) {
        if(!actor.hasRole("TB_OFFICER") || !actor.permissions().contains(permission) || actor.facilityIds().isEmpty()) {
            audit.authorizationDenied(actor.userId()); throw ApplicationFailure.forbidden();
        }
    }
    public Facility selectedFacility(CurrentActor actor,String permission,UUID id) {
        officer(actor,permission);
        if(id==null || !actor.facilityIds().contains(id)) throw ApplicationFailure.missing();
        Facility facility=em.find(Facility.class,id,LockModeType.PESSIMISTIC_READ);
        if(facility==null || !Boolean.TRUE.equals(facility.getActive())) throw ApplicationFailure.missing(); return facility;
    }
    public boolean currentPatient(CurrentActor actor,UUID id) {
        return em.createQuery("select count(p) from Patient p where p.id=:id and "+CURRENT_PATIENT,Long.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getSingleResult()>0;
    }
    public Patient patient(CurrentActor actor,String permission,UUID id) {
        officer(actor,permission);
        var found=em.createQuery("select p from Patient p where p.id=:id and "+CURRENT_PATIENT,Patient.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(found.isEmpty()) throw ApplicationFailure.missing(); return found.getFirst();
    }
    public UUID patientFacility(CurrentActor actor,UUID id) {
        var registrations=em.createQuery("select r.facility.id from TBRegistration r where r.patient.id=:id and r.facility.id in :facilities and r.facility.active=true and r.status in ('OPEN','DIAGNOSED') order by r.facility.id",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).setMaxResults(1).getResultList();
        if(!registrations.isEmpty()) return registrations.getFirst();
        var cases=em.createQuery("select c.currentFacility.id from TBCase c where c.registration.patient.id=:id and c.currentFacility.id in :facilities and c.currentFacility.active=true and c.status in ('ACTIVE','REFERRED') order by c.currentFacility.id",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).setMaxResults(1).getResultList();
        if(cases.isEmpty()) throw ApplicationFailure.missing(); return cases.getFirst();
    }
    public TBRegistration registration(CurrentActor actor,String permission,UUID id,boolean lock) {
        officer(actor,permission);
        var ids=em.createQuery("select r.id from TBRegistration r where r.id=:id and r.facility.id in :facilities and r.facility.active=true",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing();
        // Scalar scope lookup first; the lock fetch reads fresh state after any concurrent command.
        return lock ? em.find(TBRegistration.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(TBRegistration.class,id);
    }
    public TBCase tbCase(CurrentActor actor,String permission,UUID id) {
        officer(actor,permission);
        var found=em.createQuery("""
                select c from TBCase c join fetch c.currentFacility f join fetch c.registration r
                join fetch r.patient left join fetch c.confirmingDiagnosis
                where c.id=:id and f.id in :facilities and f.active=true
                """,TBCase.class).setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(found.isEmpty()) throw ApplicationFailure.missing(); return found.getFirst();
    }
    public UUID diagnosisRegistration(CurrentActor actor,UUID diagnosis) {
        officer(actor,"DIAGNOSIS_WRITE");
        var found=em.createQuery("select d.registration.id from Diagnosis d where d.id=:id and d.registration.facility.id in :facilities and d.registration.facility.active=true",UUID.class)
                .setParameter("id",diagnosis).setParameter("facilities",actor.facilityIds()).getResultList();
        if(found.isEmpty()) throw ApplicationFailure.missing(); return found.getFirst();
    }
    public Diagnosis diagnosis(CurrentActor actor,UUID id) {
        officer(actor,"DIAGNOSIS_READ");
        var found=em.createQuery("""
                select d from Diagnosis d join fetch d.registration r join fetch r.facility f
                left join fetch d.referredToFacility
                where d.id=:id and f.id in :facilities and f.active=true
                """,Diagnosis.class).setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(found.isEmpty()) throw ApplicationFailure.missing(); return found.getFirst();
    }
}
