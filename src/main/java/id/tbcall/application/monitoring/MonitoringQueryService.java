package id.tbcall.application.monitoring;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.monitoring.MonitoringDtos.*;

@Service
@Transactional(readOnly=true)
public class MonitoringQueryService {
    private final EntityManager em; private final MonitoringAccess access; private final MonitoringViews views;
    public MonitoringQueryService(EntityManager em,MonitoringAccess access,MonitoringViews views) { this.em=em; this.access=access; this.views=views; }
    public PlanDetail plan(CurrentActor actor,UUID id) { return views.plan(access.plan(actor,"MONITORING_READ",id,false)); }
    public Page<PlanDetail> history(CurrentActor actor,UUID id,boolean preventive,int page,int size) {
        access.staffTarget(actor,"MONITORING_READ",preventive ? null : id,preventive ? id : null,false);
        return page("p","from MonitoringPlan p where p."+(preventive ? "preventiveTreatment" : "treatment")+".id=:id","p.createdAt desc,p.id desc",Map.of("id",id),MonitoringPlan.class,views::plan,page,size);
    }
    public Page<EventDetail> events(CurrentActor actor,UUID id,int page,int size) {
        access.plan(actor,"MONITORING_READ",id,false);
        return page("e","from MonitoringEvent e where e.monitoringPlan.id=:id","e.scheduledAt,e.id",Map.of("id",id),MonitoringEvent.class,views::event,page,size);
    }
    public Page<SafeEvent> selfEvents(CurrentActor actor,int page,int size) { return safeEvents(MonitoringAccess.selfScope(),Map.of("patient",access.self(actor,"MONITORING_READ")),page,size); }
    public Page<SafeEvent> supportingEvents(CurrentActor actor,UUID caseId,int page,int size) { access.supporter(actor,"MONITORING_READ",caseId); return safeEvents("tc.id=:case",Map.of("case",caseId),page,size); }
    private Page<SafeEvent> safeEvents(String scope,Map<String,Object> params,int page,int size) {
        return page("e","from MonitoringEvent e join e.monitoringPlan p"+MonitoringAccess.planJoins()+"where "+scope,"e.scheduledAt,e.id",params,MonitoringEvent.class,views::safeEvent,page,size);
    }
    public AlertDetail alert(CurrentActor actor,UUID id) { return views.alert(access.staffAlert(actor,"ALERT_READ",id,false)); }
    public Page<AlertDetail> alerts(CurrentActor actor,String status,String targetType,int page,int size) {
        access.officer(actor,"ALERT_READ"); var params=new HashMap<String,Object>(); params.put("facilities",actor.facilityIds());
        String where=MonitoringAccess.staffScope();
        if(status!=null) { if(!Set.of("OPEN","ACKNOWLEDGED","RESOLVED","DISMISSED").contains(status)) throw ApplicationFailure.invalid("Status peringatan tidak valid."); where+=" and a.status=:status"; params.put("status",status); }
        if(targetType!=null) { if(!Set.of("TREATMENT","TPT").contains(targetType)) throw ApplicationFailure.invalid("Target pemantauan tidak valid."); where+=targetType.equals("TREATMENT") ? " and t.id is not null" : " and pt.id is not null"; }
        return page("a","from Alert a left join a.treatment t left join t.facility tf left join a.preventiveTreatment pt left join pt.facility pf where "+where,"a.triggeredAt desc,a.id desc",params,Alert.class,views::alert,page,size);
    }
    public Page<SafeAlert> selfAlerts(CurrentActor actor,int page,int size) { return safeAlerts(actor,MonitoringAccess.selfScope(),Map.of("patient",access.self(actor,"ALERT_READ")),page,size); }
    public Page<SafeAlert> supportingAlerts(CurrentActor actor,UUID caseId,int page,int size) { access.supporter(actor,"ALERT_READ",caseId); return safeAlerts(actor,"tc.id=:case",Map.of("case",caseId),page,size); }
    private Page<SafeAlert> safeAlerts(CurrentActor actor,String scope,Map<String,Object> params,int page,int size) {
        return page("a",alertPlanFrom()+"where "+scope,"a.triggeredAt desc,a.id desc",params,Alert.class,a -> views.safeAlert(a,actor.userId()),page,size);
    }
    public static String alertPlanFrom() { return "from Alert a join a.monitoringEvent e join e.monitoringPlan p"+MonitoringAccess.planJoins(); }
    public Page<NotificationDetail> notifications(CurrentActor actor,int page,int size) {
        access.permission(actor,"NOTIFICATION_READ_SELF");
        return page("n","from Notification n where n.user.id=:user","n.scheduledAt desc,n.id desc",Map.of("user",actor.userId()),Notification.class,views::notification,page,size);
    }
    private <T,R> Page<R> page(String alias,String from,String order,Map<String,Object> params,Class<T> entity,Function<T,R> projection,int page,int size) {
        MonitoringAccess.page(page,size); var query=em.createQuery("select "+alias+" "+from+" order by "+order,entity); var count=em.createQuery("select count("+alias+") "+from,Long.class);
        params.forEach((k,v) -> { query.setParameter(k,v); count.setParameter(k,v); });
        return new Page<>(query.setFirstResult(page*size).setMaxResults(size).getResultList().stream().map(projection).toList(),page,size,count.getSingleResult());
    }
}
