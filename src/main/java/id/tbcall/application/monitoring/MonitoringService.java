package id.tbcall.application.monitoring;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.monitoring.MonitoringDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class MonitoringService {
    private final EntityManager em; private final MonitoringAccess access; private final MonitoringValidation validation;
    private final MonitoringViews views; private final MonitoringAlerts alerts; private final MonitoringSourceAuthorityPolicy source; private final AuditService audit;
    public MonitoringService(EntityManager em,MonitoringAccess access,MonitoringValidation validation,MonitoringViews views,MonitoringAlerts alerts,MonitoringSourceAuthorityPolicy source,AuditService audit) {
        this.em=em; this.access=access; this.validation=validation; this.views=views; this.alerts=alerts; this.source=source; this.audit=audit;
    }
    public PlanDetail create(CurrentActor actor,UUID id,boolean tpt,PlanInput input) {
        var target=access.staffTarget(actor,"MONITORING_MANAGE",tpt ? null : id,tpt ? id : null,true);
        if(!"ACTIVE".equals(target.status())) throw MonitoringAccess.state();
        String column=tpt ? "preventiveTreatment" : "treatment";
        if(em.createQuery("select count(p) from MonitoringPlan p where p."+column+".id=:id and p.status='ACTIVE'",Long.class).setParameter("id",id).getSingleResult()>0) throw MonitoringAccess.state();
        source.requireLocalManage(actor,"MONITORING_MANAGE",target.facility().getId(),null);
        MonitoringPlan p=new MonitoringPlan(); p.setTreatment(target.treatment()); p.setPreventiveTreatment(target.tpt()); p.setStartDate(input.startDate()); p.setEndDate(input.endDate()); p.setNotes(input.notes()); p.setStatus("ACTIVE"); p.setRulesVersion("MANUAL_V1"); p.setCreatedByUser(em.getReference(User.class,actor.userId())); validation.plan(p,target);
        em.persist(p); audit.record(actor.userId(),"MONITORING_PLAN_CREATED","MONITORING_PLAN",p.getId());
        for(EventInput event:input.events()) add(p,event,actor.userId()); em.flush(); em.refresh(p); return views.plan(p);
    }
    public PlanDetail patch(CurrentActor actor,UUID id,PlanPatch input,String match) {
        var p=managePlan(actor,id,match); if(input.has("endDate")) p.setEndDate(input.getEndDate()); if(input.has("notes")) p.setNotes(input.getNotes()); validation.plan(p,access.owner(p));
        for(var e:em.createQuery("select e from MonitoringEvent e where e.monitoringPlan.id=:id and e.status<>'CANCELLED'",MonitoringEvent.class).setParameter("id",id).getResultList()) validation.event(e);
        audit.record(actor.userId(),"MONITORING_PLAN_UPDATED","MONITORING_PLAN",id); em.flush(); em.refresh(p); return views.plan(p);
    }
    public PlanDetail cancelPlan(CurrentActor actor,UUID id,String match) {
        var p=managePlan(actor,id,match); close(p,"CANCELLED",actor.userId()); audit.record(actor.userId(),"MONITORING_PLAN_CANCELLED","MONITORING_PLAN",id); em.flush(); em.refresh(p); return views.plan(p);
    }
    public EventDetail addEvent(CurrentActor actor,UUID id,EventInput input,String match) {
        var p=managePlan(actor,id,match); em.lock(p,LockModeType.PESSIMISTIC_FORCE_INCREMENT); var e=add(p,input,actor.userId()); em.flush(); em.refresh(e); return views.event(e);
    }
    private MonitoringEvent add(MonitoringPlan p,EventInput input,UUID actor) {
        var e=new MonitoringEvent(); e.setMonitoringPlan(p); e.setEventType(input.eventType()); e.setScheduledAt(input.scheduledAt()); e.setDueAt(input.dueAt()); validation.event(e); e.setStatus(validation.status(e)); em.persist(e);
        audit.record(actor,"MONITORING_EVENT_CREATED","MONITORING_EVENT",e.getId()); alerts.open(e,actor); return e;
    }
    public EventDetail reschedule(CurrentActor actor,UUID id,EventPatch input,String match) {
        var e=manageEvent(actor,id,match); if(!Set.of("SCHEDULED","DUE").contains(e.getStatus())) throw MonitoringAccess.state();
        if(input.has("scheduledAt")) e.setScheduledAt(input.getScheduledAt()); if(input.has("dueAt")) e.setDueAt(input.getDueAt()); validation.event(e); e.setStatus(validation.status(e)); alerts.open(e,actor.userId()); return finish(actor,e,"MONITORING_EVENT_RESCHEDULED");
    }
    public EventDetail complete(CurrentActor actor,UUID id,CompletionInput input,String match) {
        var e=manageEvent(actor,id,match); requireOpen(e); var at=input.completedAt()==null ? validation.now() : input.completedAt();
        if(at.isBefore(e.getScheduledAt()) || at.isAfter(validation.now())) throw ApplicationFailure.invalid("Waktu penyelesaian pemantauan tidak valid.");
        e.setCompletedAt(at); e.setStatus("COMPLETED"); alerts.resolve(e,actor.userId()); return finish(actor,e,"MONITORING_EVENT_COMPLETED");
    }
    public EventDetail cancelEvent(CurrentActor actor,UUID id,String match) {
        var e=manageEvent(actor,id,match); requireOpen(e); e.setStatus("CANCELLED"); alerts.resolve(e,actor.userId()); return finish(actor,e,"MONITORING_EVENT_CANCELLED");
    }
    private MonitoringPlan managePlan(CurrentActor actor,UUID id,String match) {
        var p=access.plan(actor,"MONITORING_MANAGE",id,true); IfMatch.require(match,p.getVersion()); MonitoringAccess.active(p); source.requireLocalManage(actor,"MONITORING_MANAGE",access.owner(p).facility().getId(),id); return p;
    }
    private MonitoringEvent manageEvent(CurrentActor actor,UUID id,String match) {
        var e=access.event(actor,"MONITORING_MANAGE",id,true); IfMatch.require(match,e.getVersion()); MonitoringAccess.active(e.getMonitoringPlan()); source.requireLocalManage(actor,"MONITORING_MANAGE",access.owner(e.getMonitoringPlan()).facility().getId(),e.getMonitoringPlan().getId()); return e;
    }
    private void requireOpen(MonitoringEvent e) { if(!MonitoringAccess.openEvent(e)) throw MonitoringAccess.state(); }
    private EventDetail finish(CurrentActor actor,MonitoringEvent e,String action) { audit.record(actor.userId(),action,"MONITORING_EVENT",e.getId()); em.flush(); em.refresh(e); return views.event(e); }
    public void close(MonitoringPlan p,String status,UUID actor) {
        p.setStatus(status);
        var ids=em.createQuery("select e.id from MonitoringEvent e where e.monitoringPlan.id=:id order by e.id",UUID.class).setParameter("id",p.getId()).getResultList();
        for(UUID id:ids) { var e=em.find(MonitoringEvent.class,id,LockModeType.PESSIMISTIC_WRITE); if(MonitoringAccess.openEvent(e)) e.setStatus("CANCELLED"); alerts.resolve(e,actor); }
    }
}
