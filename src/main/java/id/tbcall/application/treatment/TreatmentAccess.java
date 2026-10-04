package id.tbcall.application.treatment;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class TreatmentAccess {
    private final EntityManager em;
    private final ClinicalAccess clinical;
    private final AuditService audit;
    public TreatmentAccess(EntityManager em,ClinicalAccess clinical,AuditService audit) { this.em=em; this.clinical=clinical; this.audit=audit; }
    public TBCase staffCase(CurrentActor actor,String permission,UUID id,boolean lock) {
        clinical.officer(actor,permission);
        var ids=em.createQuery("select c.id from TBCase c where c.id=:id and c.currentFacility.id in :facilities and c.currentFacility.active=true",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing();
        TBCase owner=lock ? em.find(TBCase.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(TBCase.class,id);
        if(!actor.facilityIds().contains(owner.getCurrentFacility().getId()) || !Boolean.TRUE.equals(owner.getCurrentFacility().getActive())) throw ApplicationFailure.missing();
        return owner;
    }
    public Treatment staff(CurrentActor actor,String permission,UUID id,boolean lock) {
        clinical.officer(actor,permission);
        var owners=em.createQuery("select t.tbCase.id from Treatment t where t.id=:id and t.facility.id in :facilities and t.facility.active=true and t.tbCase.currentFacility.id in :facilities and t.tbCase.currentFacility.active=true",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(owners.isEmpty()) throw ApplicationFailure.missing();
        // No entity hydration before the owner lock: outcome and laboratory correction share this case lock.
        staffCase(actor,permission,owners.getFirst(),lock);
        Treatment treatment=lock ? em.find(Treatment.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(Treatment.class,id);
        if(!actor.facilityIds().contains(treatment.getFacility().getId()) || !Boolean.TRUE.equals(treatment.getFacility().getActive())) throw ApplicationFailure.missing();
        return treatment;
    }
    public UUID selfPatient(CurrentActor actor,String permission) {
        if(!actor.hasRole("PATIENT") || !actor.permissions().contains(permission) || actor.selfPatientId()==null) denied(actor);
        return actor.selfPatientId();
    }
    public void supporter(CurrentActor actor,String permission,UUID caseId) {
        if(!actor.hasRole("TREATMENT_SUPPORTER") || !actor.permissions().contains(permission)) denied(actor);
        if(!actor.supporterCaseIds().contains(caseId)) throw ApplicationFailure.missing();
    }
    public Treatment self(CurrentActor actor,String permission,boolean active) {
        return selected("t.tbCase.registration.patient.id=:owner",selfPatient(actor,permission),active);
    }
    public Treatment supporting(CurrentActor actor,String permission,UUID caseId,boolean active) {
        supporter(actor,permission,caseId); return selected("t.tbCase.id=:owner",caseId,active);
    }
    private Treatment selected(String predicate,UUID owner,boolean active) {
        var ids=em.createQuery("select t.id from Treatment t where "+predicate+(active ? " and t.status='ACTIVE'" : "")+" order by t.startDate desc,t.createdAt desc,t.id desc",UUID.class)
                .setParameter("owner",owner).setMaxResults(active ? 2 : 1).getResultList();
        if(ids.isEmpty()) {
            if(active && em.createQuery("select count(t) from Treatment t where "+predicate,Long.class).setParameter("owner",owner).getSingleResult()>0) throw TreatmentErrors.state();
            throw ApplicationFailure.missing();
        }
        if(active && ids.size()>1) throw new ApplicationFailure(409,"ACTIVE_TREATMENT_AMBIGUOUS","Pengobatan aktif belum pasti","Lebih dari satu pengobatan aktif tersedia. Hubungi petugas untuk memastikan episode yang benar.");
        if(!active) return em.find(Treatment.class,ids.getFirst());
        UUID caseId=em.createQuery("select t.tbCase.id from Treatment t where t.id=:id",UUID.class).setParameter("id",ids.getFirst()).getSingleResult();
        em.find(TBCase.class,caseId,LockModeType.PESSIMISTIC_WRITE);
        Treatment treatment=em.find(Treatment.class,ids.getFirst(),LockModeType.PESSIMISTIC_WRITE);
        requireActive(treatment); return treatment;
    }
    public UUID childTreatment(CurrentActor actor,String permission,String entity,UUID id) {
        clinical.officer(actor,permission);
        // Entity names are fixed internal constants (FollowUp/AdverseEvent).
        var ids=em.createQuery("select v.treatment.id from "+entity+" v where v.id=:id",UUID.class).setParameter("id",id).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing(); return ids.getFirst();
    }
    public Facility facility(CurrentActor actor,String permission,UUID id) { return clinical.selectedFacility(actor,permission,id); }
    public void requireActive(Treatment treatment) { if(!"ACTIVE".equals(treatment.getStatus())) throw TreatmentErrors.state(); }
    private void denied(CurrentActor actor) { audit.authorizationDenied(actor.userId()); throw ApplicationFailure.forbidden(); }
}
