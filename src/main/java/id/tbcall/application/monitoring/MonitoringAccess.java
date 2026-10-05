package id.tbcall.application.monitoring;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class MonitoringAccess {
    public record Target(Treatment treatment,PreventiveTreatment tpt) {
        public Facility facility() { return treatment!=null ? treatment.getFacility() : tpt.getFacility(); }
        public String type() { return treatment!=null ? "TREATMENT" : "TPT"; }
        public UUID id() { return treatment!=null ? treatment.getId() : tpt.getId(); }
        public String status() { return treatment!=null ? treatment.getStatus() : tpt.getStatus(); }
        public LocalDate startDate() { return treatment!=null ? treatment.getStartDate() : tpt.getStartDate(); }
        public LocalDate plannedEndDate() { return treatment!=null ? treatment.getPlannedEndDate() : tpt.getPlannedEndDate(); }
    }
    private final EntityManager em; private final ClinicalAccess clinical; private final AuditService audit;
    public MonitoringAccess(EntityManager em,ClinicalAccess clinical,AuditService audit) { this.em=em; this.clinical=clinical; this.audit=audit; }
    public void officer(CurrentActor actor,String permission) { clinical.officer(actor,permission); }
    public void permission(CurrentActor actor,String permission) { if(!actor.permissions().contains(permission)) denied(actor); }
    private void denied(CurrentActor actor) { audit.authorizationDenied(actor.userId()); throw ApplicationFailure.forbidden(); }
    public UUID self(CurrentActor actor,String permission) { if(!actor.hasRole("PATIENT") || actor.selfPatientId()==null) denied(actor); permission(actor,permission); return actor.selfPatientId(); }
    public void supporter(CurrentActor actor,String permission,UUID caseId) { if(!actor.hasRole("TREATMENT_SUPPORTER")) denied(actor); permission(actor,permission); if(!actor.supporterCaseIds().contains(caseId)) throw ApplicationFailure.missing(); }
    public Target target(UUID treatmentId,UUID tptId,boolean lock) {
        if(treatmentId!=null) {
            var cases=em.createQuery("select t.tbCase.id from Treatment t where t.id=:id",UUID.class).setParameter("id",treatmentId).getResultList();
            if(cases.isEmpty()) throw ApplicationFailure.missing();
            if(lock) em.find(TBCase.class,cases.getFirst(),LockModeType.PESSIMISTIC_WRITE);
            return new Target(find(Treatment.class,treatmentId,lock),null);
        }
        var contacts=em.createQuery("select c.id from PreventiveTreatment t left join t.contact c where t.id=:id",UUID.class).setParameter("id",tptId).getResultList();
        if(contacts.isEmpty()) throw ApplicationFailure.missing();
        if(lock && contacts.getFirst()!=null) em.find(Contact.class,contacts.getFirst(),LockModeType.PESSIMISTIC_WRITE);
        return new Target(null,find(PreventiveTreatment.class,tptId,lock));
    }
    public Target staffTarget(CurrentActor actor,String permission,UUID treatmentId,UUID tptId,boolean lock) {
        officer(actor,permission);
        String entity=treatmentId!=null ? "Treatment" : "PreventiveTreatment";
        var owners=em.createQuery("select t.facility.id from "+entity+" t where t.id=:id and t.facility.active=true and t.facility.id in :facilities",UUID.class)
                .setParameter("id",treatmentId!=null ? treatmentId : tptId).setParameter("facilities",actor.facilityIds()).getResultList();
        if(owners.isEmpty()) throw ApplicationFailure.missing();
        Target target=target(treatmentId,tptId,lock); scope(actor,target); return target;
    }
    public void scope(CurrentActor actor,Target target) { if(target.facility()==null || !Boolean.TRUE.equals(target.facility().getActive()) || !actor.facilityIds().contains(target.facility().getId())) throw ApplicationFailure.missing(); }
    public Target owner(MonitoringPlan p) { return new Target(p.getTreatment(),p.getPreventiveTreatment()); }
    public MonitoringPlan plan(CurrentActor actor,String permission,UUID id,boolean lock) {
        officer(actor,permission); var ids=planTargets(id); staffTarget(actor,permission,(UUID)ids[0],(UUID)ids[1],lock); return find(MonitoringPlan.class,id,lock);
    }
    public MonitoringPlan systemPlan(UUID id) { var ids=planTargets(id); target((UUID)ids[0],(UUID)ids[1],true); return find(MonitoringPlan.class,id,true); }
    private Object[] planTargets(UUID id) {
        var rows=em.createQuery("select t.id,pt.id from MonitoringPlan p left join p.treatment t left join p.preventiveTreatment pt where p.id=:id",Object[].class).setParameter("id",id).getResultList();
        if(rows.isEmpty()) throw ApplicationFailure.missing(); return rows.getFirst();
    }
    public MonitoringEvent event(CurrentActor actor,String permission,UUID id,boolean lock) {
        officer(actor,permission); var ids=em.createQuery("select e.monitoringPlan.id from MonitoringEvent e where e.id=:id",UUID.class).setParameter("id",id).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing(); plan(actor,permission,ids.getFirst(),lock); return find(MonitoringEvent.class,id,lock);
    }
    public Alert alert(UUID id,boolean lock) {
        var rows=em.createQuery("select e.id,t.id,pt.id from Alert a left join a.monitoringEvent e left join a.treatment t left join a.preventiveTreatment pt where a.id=:id",Object[].class).setParameter("id",id).getResultList();
        if(rows.isEmpty()) throw ApplicationFailure.missing(); var row=rows.getFirst();
        if(row[0]!=null) {
            UUID planId=em.createQuery("select e.monitoringPlan.id from MonitoringEvent e where e.id=:id",UUID.class).setParameter("id",row[0]).getSingleResult();
            if(lock) { systemPlan(planId); find(MonitoringEvent.class,(UUID)row[0],true); }
        } else if(row[1]!=null || row[2]!=null) target((UUID)row[1],(UUID)row[2],lock);
        else throw ApplicationFailure.missing();
        return find(Alert.class,id,lock);
    }
    public Alert staffAlert(CurrentActor actor,String permission,UUID id,boolean lock) {
        officer(actor,permission);
        var rows=em.createQuery("select a.id from Alert a left join a.treatment t left join t.facility tf left join a.preventiveTreatment pt left join pt.facility pf where a.id=:id and "+staffScope(),UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(rows.isEmpty()) throw ApplicationFailure.missing(); Alert a=alert(id,lock); scope(actor,new Target(a.getTreatment(),a.getPreventiveTreatment())); return a;
    }
    public static String staffScope() { return "((tf.id in :facilities and tf.active=true) or (pf.id in :facilities and pf.active=true))"; }
    public static String selfScope() { return "(r.patient.id=:patient or pt.patient.id=:patient or c.linkedPatient.id=:patient)"; }
    public static String planJoins() { return " left join p.treatment t left join t.tbCase tc left join tc.registration r left join t.facility tf left join p.preventiveTreatment pt left join pt.contact c left join pt.facility pf "; }
    private <T> T find(Class<T> type,UUID id,boolean lock) { T value=lock ? em.find(type,id,LockModeType.PESSIMISTIC_WRITE) : em.find(type,id); if(value==null) throw ApplicationFailure.missing(); return value; }
    public static void page(int page,int size) { if(page<0 || size<1 || size>50 || (long)page*size>Integer.MAX_VALUE) throw ApplicationFailure.invalid("Ukuran halaman harus 1 sampai 50."); }
    public static ApplicationFailure state() { return new ApplicationFailure(409,"MONITORING_STATE_CONFLICT","Status pemantauan tidak sesuai","Perubahan tidak tersedia untuk status data saat ini."); }
    public static void active(MonitoringPlan p) { if(!"ACTIVE".equals(p.getStatus())) throw state(); }
    public static boolean openEvent(MonitoringEvent e) { return Set.of("SCHEDULED","DUE","OVERDUE").contains(e.getStatus()); }
}
