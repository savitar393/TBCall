package id.tbcall.application.monitoring;

import jakarta.persistence.EntityManager;
import java.time.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class MonitoringSweepService {
    private final EntityManager em; private final Clock clock; private final MonitoringSweepWorker worker;
    public MonitoringSweepService(EntityManager em,Clock clock,MonitoringSweepWorker worker) { this.em=em; this.clock=clock; this.worker=worker; }
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public void sweep() {
        // Scalar discovery does not hydrate or lock any target. Every candidate is rechecked in its own transaction.
        var plans=em.createQuery("select p.id from MonitoringPlan p left join p.treatment t left join p.preventiveTreatment pt where p.status='ACTIVE' and (t.status='COMPLETED' or pt.status in ('COMPLETED','STOPPED','LOST_TO_FOLLOW_UP') or exists (select e.id from MonitoringEvent e where e.monitoringPlan.id=p.id and ((e.status='SCHEDULED' and e.scheduledAt<=:now) or (e.status in ('SCHEDULED','DUE') and e.dueAt<:now)))) order by p.id",UUID.class)
                .setParameter("now",OffsetDateTime.now(clock)).setMaxResults(100).getResultList();
        for(UUID id:plans) worker.process(id);
    }
}
