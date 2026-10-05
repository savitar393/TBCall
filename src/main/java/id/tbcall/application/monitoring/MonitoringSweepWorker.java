package id.tbcall.application.monitoring;

import id.tbcall.application.common.AuditService;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class MonitoringSweepWorker {
    private final EntityManager em; private final MonitoringAccess access; private final MonitoringValidation validation; private final MonitoringAlerts alerts; private final MonitoringService commands; private final AuditService audit;
    public MonitoringSweepWorker(EntityManager em,MonitoringAccess access,MonitoringValidation validation,MonitoringAlerts alerts,MonitoringService commands,AuditService audit) { this.em=em; this.access=access; this.validation=validation; this.alerts=alerts; this.commands=commands; this.audit=audit; }
    @Transactional(propagation=Propagation.REQUIRES_NEW,isolation=Isolation.READ_COMMITTED)
    public void process(UUID planId) {
        var p=access.systemPlan(planId); if(!"ACTIVE".equals(p.getStatus())) return; var target=access.owner(p);
        if("COMPLETED".equals(target.status()) || (target.tpt()!=null && Set.of("STOPPED","LOST_TO_FOLLOW_UP").contains(target.status()))) {
            commands.close(p,"COMPLETED".equals(target.status()) ? "COMPLETED" : "CANCELLED",null); audit.record(null,"MONITORING_PLAN_AUTO_CLOSED","MONITORING_PLAN",planId); return;
        }
        var ids=em.createQuery("select e.id from MonitoringEvent e where e.monitoringPlan.id=:plan and e.status in ('SCHEDULED','DUE') order by e.id",UUID.class).setParameter("plan",planId).getResultList();
        for(UUID id:ids) {
            var e=em.find(MonitoringEvent.class,id,LockModeType.PESSIMISTIC_WRITE); if(!Set.of("SCHEDULED","DUE").contains(e.getStatus())) continue;
            String state=validation.status(e); if(!state.equals(e.getStatus())) { e.setStatus(state); audit.record(null,"OVERDUE".equals(state) ? "MONITORING_EVENT_OVERDUE" : "MONITORING_EVENT_DUE","MONITORING_EVENT",id); }
            alerts.open(e,null);
        }
    }
}
