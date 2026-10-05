package id.tbcall.application.monitoring;

import id.tbcall.application.common.AuditService;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class MonitoringAlerts {
    private final EntityManager em; private final AuditService audit; private final Clock clock;
    public MonitoringAlerts(EntityManager em,AuditService audit,Clock clock) { this.em=em; this.audit=audit; this.clock=clock; }
    public void open(MonitoringEvent event,UUID actor) {
        if(!"OVERDUE".equals(event.getStatus())) return;
        if(em.createQuery("select count(a) from Alert a where a.monitoringEvent.id=:id",Long.class).setParameter("id",event.getId()).getSingleResult()>0) return;
        var p=event.getMonitoringPlan(); Alert a=new Alert(); a.setMonitoringEvent(event); a.setAlertType("MONITORING_OVERDUE"); a.setSeverity("WARNING"); a.setStatus("OPEN");
        a.setTriggeredAt(now()); a.setDueAt(event.getDueAt()); a.setRuleCode("MONITORING_OVERDUE_V1"); a.setMessage(MonitoringViews.SAFE_MESSAGE); a.setDetails(Map.of());
        Facility owner; Set<UUID> patients=new HashSet<>();
        if(p.getTreatment()!=null) {
            var t=p.getTreatment(); a.setTreatment(t); a.setTbCase(t.getTbCase()); a.setPatient(t.getTbCase().getRegistration().getPatient()); owner=t.getFacility(); patients.add(a.getPatient().getId());
        } else {
            var t=p.getPreventiveTreatment(); a.setPreventiveTreatment(t); a.setContact(t.getContact()); owner=t.getFacility();
            if(t.getPatient()!=null) { a.setPatient(t.getPatient()); patients.add(t.getPatient().getId()); }
            if(t.getContact()!=null && t.getContact().getLinkedPatient()!=null) { if(a.getPatient()==null) a.setPatient(t.getContact().getLinkedPatient()); patients.add(t.getContact().getLinkedPatient().getId()); }
        }
        em.persist(a); em.flush(); audit.record(actor,"ALERT_OPENED","ALERT",a.getId()); fanout(a,owner,patients);
    }
    private void fanout(Alert a,Facility owner,Set<UUID> patients) {
        Set<UUID> recipients=new LinkedHashSet<>();
        if(owner!=null && Boolean.TRUE.equals(owner.getActive())) recipients.addAll(em.createQuery("select uf.userId from UserFacility uf where uf.facilityId=:facility and uf.active=true and exists (select ur.userId from UserRole ur where ur.userId=uf.userId and ur.role.code='TB_OFFICER')",UUID.class).setParameter("facility",owner.getId()).getResultList());
        if(!patients.isEmpty()) recipients.addAll(em.createQuery("select l.user.id from PatientUserLink l where l.patient.id in :patients and l.relationshipType='SELF' and l.verificationStatus='VERIFIED'",UUID.class).setParameter("patients",patients).getResultList());
        if(a.getTreatment()!=null) recipients.addAll(em.createQuery("select s.linkedUser.id from PatientSupporter s where s.tbCase.id=:case and s.active=true and s.linkedUser is not null",UUID.class).setParameter("case",a.getTbCase().getId()).getResultList());
        for(UUID recipient:recipients) {
            long eligible=em.createQuery("select count(u) from User u where u.id=:id and u.status='ACTIVE' and exists (select rp.permissionId from RolePermission rp where rp.permission.code='NOTIFICATION_READ_SELF' and rp.roleId in (select ur.roleId from UserRole ur where ur.userId=u.id))",Long.class).setParameter("id",recipient).getSingleResult();
            if(eligible==0) continue;
            Notification n=new Notification(); n.setAlert(a); n.setUser(em.getReference(User.class,recipient)); n.setChannel("IN_APP"); n.setStatus("DELIVERED"); n.setScheduledAt(now()); n.setDeliveredAt(now()); n.setPayload(Map.of("alertId",a.getId().toString(),"alertType",a.getAlertType(),"severity",a.getSeverity())); em.persist(n);
        }
    }
    public void resolve(MonitoringEvent event,UUID actor) {
        var ids=em.createQuery("select a.id from Alert a where a.monitoringEvent.id=:event order by a.id",UUID.class).setParameter("event",event.getId()).getResultList();
        for(UUID id:ids) { var a=em.find(Alert.class,id,LockModeType.PESSIMISTIC_WRITE); if(Set.of("OPEN","ACKNOWLEDGED").contains(a.getStatus())) { a.setStatus("RESOLVED"); a.setResolvedAt(now()); audit.record(actor,"ALERT_AUTO_RESOLVED","ALERT",a.getId()); } }
    }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
}
