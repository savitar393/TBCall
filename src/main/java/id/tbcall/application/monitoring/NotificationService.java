package id.tbcall.application.monitoring;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.Notification;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.monitoring.MonitoringDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class NotificationService {
    private final EntityManager em; private final MonitoringAccess access; private final MonitoringViews views; private final AuditService audit; private final Clock clock;
    public NotificationService(EntityManager em,MonitoringAccess access,MonitoringViews views,AuditService audit,Clock clock) { this.em=em; this.access=access; this.views=views; this.audit=audit; this.clock=clock; }
    public NotificationDetail read(CurrentActor actor,UUID id,String match) {
        access.permission(actor,"NOTIFICATION_READ_SELF");
        var ids=em.createQuery("select n.id from Notification n where n.id=:id and n.user.id=:user",UUID.class).setParameter("id",id).setParameter("user",actor.userId()).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing(); var n=em.find(Notification.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(!n.getUser().getId().equals(actor.userId())) throw ApplicationFailure.missing(); IfMatch.require(match,n.getVersion());
        if("READ".equals(n.getStatus())) return views.notification(n); if(!java.util.Set.of("DELIVERED","SENT").contains(n.getStatus())) throw MonitoringAccess.state();
        n.setStatus("READ"); n.setReadAt(OffsetDateTime.now(clock)); audit.record(actor.userId(),"NOTIFICATION_READ","NOTIFICATION",id); em.flush(); em.refresh(n); return views.notification(n);
    }
}
