package id.tbcall.application.monitoring;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.monitoring.MonitoringDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class AlertService {
    private final EntityManager em; private final MonitoringAccess access; private final MonitoringViews views; private final AuditService audit; private final Clock clock;
    public AlertService(EntityManager em,MonitoringAccess access,MonitoringViews views,AuditService audit,Clock clock) { this.em=em; this.access=access; this.views=views; this.audit=audit; this.clock=clock; }
    public AlertDetail acknowledge(CurrentActor actor,UUID id,String match) {
        var a=access.staffAlert(actor,"ALERT_ACKNOWLEDGE",id,true); IfMatch.require(match,a.getVersion());
        if("ACKNOWLEDGED".equals(a.getStatus())) return views.alert(a); if(!"OPEN".equals(a.getStatus())) throw MonitoringAccess.state();
        a.setStatus("ACKNOWLEDGED"); a.setAcknowledgedAt(now()); return finish(actor,a,"ALERT_ACKNOWLEDGED");
    }
    public AlertDetail resolve(CurrentActor actor,UUID id,String match) {
        var a=access.staffAlert(actor,"ALERT_RESOLVE",id,true); IfMatch.require(match,a.getVersion());
        if(!Set.of("OPEN","ACKNOWLEDGED").contains(a.getStatus())) throw MonitoringAccess.state();
        a.setStatus("RESOLVED"); a.setResolvedAt(now()); return finish(actor,a,"ALERT_RESOLVED");
    }
    public SafeAlert selfReceipt(CurrentActor actor,UUID id) {
        UUID patient=access.self(actor,"ALERT_ACKNOWLEDGE"); return receipt(actor,id,MonitoringAccess.selfScope(),"patient",patient);
    }
    public SafeAlert supporterReceipt(CurrentActor actor,UUID caseId,UUID id) {
        access.supporter(actor,"ALERT_ACKNOWLEDGE",caseId); return receipt(actor,id,"tc.id=:case","case",caseId);
    }
    private SafeAlert receipt(CurrentActor actor,UUID id,String scope,String param,UUID owner) {
        if(!visible(id,scope,param,owner)) throw ApplicationFailure.missing();
        var a=access.alert(id,true); if(!visible(id,scope,param,owner)) throw ApplicationFailure.missing();
        if(em.createQuery("select count(r) from AlertAcknowledgement r where r.alert.id=:alert and r.user.id=:user",Long.class).setParameter("alert",id).setParameter("user",actor.userId()).getSingleResult()==0) {
            var receipt=new AlertAcknowledgement(); receipt.setAlert(a); receipt.setUser(em.getReference(User.class,actor.userId())); receipt.setAcknowledgedAt(now()); em.persist(receipt); audit.record(actor.userId(),"ALERT_ACKNOWLEDGEMENT_RECORDED","ALERT",id); em.flush();
        }
        return views.safeAlert(a,actor.userId());
    }
    private boolean visible(UUID id,String scope,String param,UUID owner) { return em.createQuery("select count(a) "+MonitoringQueryService.alertPlanFrom()+"where a.id=:id and "+scope,Long.class).setParameter("id",id).setParameter(param,owner).getSingleResult()>0; }
    private AlertDetail finish(CurrentActor actor,Alert a,String action) { audit.record(actor.userId(),action,"ALERT",a.getId()); em.flush(); em.refresh(a); return views.alert(a); }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
}
