package id.tbcall.application.monitoring;

import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.monitoring.MonitoringDtos.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class MonitoringViews {
    public static final String SAFE_MESSAGE="Jadwal pemantauan telah melewati batas waktu.";
    private final EntityManager em;
    public MonitoringViews(EntityManager em) { this.em=em; }
    public PlanDetail plan(MonitoringPlan p) {
        var counts=new LinkedHashMap<String,Long>(); for(String state:List.of("SCHEDULED","DUE","OVERDUE","COMPLETED","CANCELLED")) counts.put(state,0L);
        for(var row:em.createQuery("select e.status,count(e) from MonitoringEvent e where e.monitoringPlan.id=:id group by e.status",Object[].class).setParameter("id",p.getId()).getResultList()) counts.put((String)row[0],(Long)row[1]);
        return new PlanDetail(p.getId(),p.getVersion(),p.getTreatment()!=null ? "TREATMENT" : "TPT",p.getTreatment()!=null ? p.getTreatment().getId() : p.getPreventiveTreatment().getId(),p.getStatus(),p.getStartDate(),p.getEndDate(),p.getRulesVersion(),p.getNotes(),counts,p.getCreatedAt(),p.getUpdatedAt());
    }
    public EventDetail event(MonitoringEvent e) { return new EventDetail(e.getId(),e.getVersion(),e.getEventType(),e.getScheduledAt(),e.getDueAt(),e.getCompletedAt(),e.getStatus()); }
    public SafeEvent safeEvent(MonitoringEvent e) { return new SafeEvent(e.getMonitoringPlan().getTreatment()!=null ? "TREATMENT" : "TPT",e.getEventType(),e.getScheduledAt(),e.getDueAt(),e.getStatus(),e.getCompletedAt()); }
    public AlertDetail alert(Alert a) {
        var e=a.getMonitoringEvent(); boolean treatment=a.getTreatment()!=null;
        return new AlertDetail(a.getId(),a.getVersion(),a.getAlertType(),a.getSeverity(),a.getStatus(),a.getTriggeredAt(),a.getDueAt(),a.getAcknowledgedAt(),a.getResolvedAt(),e==null ? null : e.getId(),e==null ? null : e.getEventType(),e==null ? null : e.getScheduledAt(),treatment ? "TREATMENT" : "TPT",treatment ? a.getTreatment().getId() : a.getPreventiveTreatment().getId(),SAFE_MESSAGE);
    }
    public SafeAlert safeAlert(Alert a,UUID user) {
        boolean acknowledged=em.createQuery("select count(r) from AlertAcknowledgement r where r.alert.id=:alert and r.user.id=:user",Long.class).setParameter("alert",a.getId()).setParameter("user",user).getSingleResult()>0;
        return new SafeAlert(a.getId(),a.getVersion(),a.getAlertType(),a.getSeverity(),a.getStatus(),a.getTriggeredAt(),a.getDueAt(),a.getMonitoringEvent().getEventType(),SAFE_MESSAGE,acknowledged);
    }
    public NotificationDetail notification(Notification n) { var a=n.getAlert(); return new NotificationDetail(n.getId(),n.getVersion(),a==null ? null : a.getId(),n.getChannel(),n.getStatus(),n.getScheduledAt(),n.getDeliveredAt(),n.getReadAt(),a==null ? null : a.getAlertType(),a==null ? null : a.getSeverity()); }
}
