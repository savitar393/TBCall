package id.tbcall.application.dashboard;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.application.clinical.ClinicalViews;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.laboratory.LabAccess;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.FollowUp;
import id.tbcall.persistence.entity.LabRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.dashboard.DashboardDtos.*;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class OperationalDashboardService {
    private static final int PAGE_SIZE=10;
    private final EntityManager em;
    private final ClinicalAccess clinical;
    private final ClinicalViews views;
    private final LabAccess laboratory;
    private final Clock clock;
    public OperationalDashboardService(EntityManager em,ClinicalAccess clinical,ClinicalViews views,LabAccess laboratory,Clock clock) {
        this.em=em; this.clinical=clinical; this.views=views; this.laboratory=laboratory; this.clock=clock;
    }
    public Dashboard read(CurrentActor actor,int upcomingPage,int overduePage,int labPage) {
        boolean cases=allowed(actor,"CASE_READ");
        boolean follows=allowed(actor,"TREATMENT_READ") && allowed(actor,"FOLLOW_UP_READ");
        boolean labs=allowed(actor,"LAB_REQUEST_READ");
        // Reuse the officer/active-assignment gate without making one domain's permission mandatory for another.
        clinical.officer(actor,cases ? "CASE_READ" : labs ? "LAB_REQUEST_READ" : follows ? "FOLLOW_UP_READ" : "CASE_READ");
        for(int page:new int[]{upcomingPage,overduePage,labPage}) {
            if(page<0 || (long)page*PAGE_SIZE>Integer.MAX_VALUE) throw ApplicationFailure.invalid("Halaman dashboard tidak valid.");
        }
        OffsetDateTime now=OffsetDateTime.now(clock),until=now.plusDays(7);
        return new Dashboard(now,until,cases ? Section.available(caseCounts(actor)) : Section.denied(),
                follows ? Section.available(new FollowUps(followUps(actor,now,until,upcomingPage,false),followUps(actor,now,until,overduePage,true))) : Section.denied(),
                labs ? Section.available(labs(actor,labPage)) : Section.denied());
    }
    private boolean allowed(CurrentActor actor,String permission) { return actor.permissions().contains(permission); }
    private CaseCounts caseCounts(CurrentActor actor) {
        String hql="select count(c) from TBCase c where c.currentFacility.id in :facilities and c.currentFacility.active=true and c.status=:status";
        long active=em.createQuery(hql,Long.class).setParameter("facilities",actor.facilityIds()).setParameter("status","ACTIVE").getSingleResult();
        long completed=em.createQuery(hql,Long.class).setParameter("facilities",actor.facilityIds()).setParameter("status","COMPLETED").getSingleResult();
        return new CaseCounts(active,completed);
    }
    private Page<FollowUpItem> followUps(CurrentActor actor,OffsetDateTime now,OffsetDateTime until,int page,boolean overdue) {
        // Same treatment/current-case facility intersection as TreatmentAccess.staff. No inferred missed status.
        String where="""
                where f.status='SCHEDULED' and f.completedAt is null and f.treatment.status='ACTIVE'
                and f.treatment.facility.id in :facilities and f.treatment.facility.active=true
                and f.treatment.tbCase.currentFacility.id in :facilities and f.treatment.tbCase.currentFacility.active=true
                """+(overdue ? " and f.scheduledAt<:now" : " and f.scheduledAt>=:now and f.scheduledAt<=:until");
        var count=followScope(em.createQuery("select count(f) from FollowUp f "+where,Long.class),actor,now,until,overdue);
        var query=followScope(em.createQuery("select f from FollowUp f "+where+" order by f.scheduledAt,f.id",FollowUp.class),actor,now,until,overdue);
        long total=count.getSingleResult();
        var rows=query.setFirstResult(page*PAGE_SIZE).setMaxResults(PAGE_SIZE).getResultList();
        var content=rows.stream().map(f -> new FollowUpItem(f.getId(),f.getTreatment().getId(),
                f.getTreatment().getTbCase().getRegistration().getPatient().getFullName(),f.getFollowUpType(),f.getScheduledAt(),views.facility(f.getFacility()))).toList();
        return new Page<>(content,page,PAGE_SIZE,total);
    }
    private <T> TypedQuery<T> followScope(TypedQuery<T> query,CurrentActor actor,OffsetDateTime now,OffsetDateTime until,boolean overdue) {
        query.setParameter("facilities",actor.facilityIds()).setParameter("now",now);
        if(!overdue) query.setParameter("until",until);
        return query;
    }
    private Page<LabItem> labs(CurrentActor actor,int page) {
        laboratory.require(actor,LabAccess.Mode.READ);
        String where=" where "+laboratory.predicate(LabAccess.Mode.READ)+" and r.status in ('REQUESTED','SENT','RECEIVED','PARTIAL')";
        var count=laboratory.scope(em.createQuery("select count(r) from LabRequest r"+where,Long.class),actor,LabAccess.Mode.READ);
        var query=laboratory.scope(em.createQuery("select r from LabRequest r"+where+" order by r.requestedAt,r.id",LabRequest.class),actor,LabAccess.Mode.READ);
        long total=count.getSingleResult();
        var rows=query.setFirstResult(page*PAGE_SIZE).setMaxResults(PAGE_SIZE).getResultList();
        var content=rows.stream().map(r -> new LabItem(r.getId(),
                (r.getRegistration()!=null ? r.getRegistration() : r.getTbCase().getRegistration()).getPatient().getFullName(),r.getStatus(),r.getRequestedAt(),
                views.facility(r.getRequestingFacility()),views.facility(r.getTestingFacility()))).toList();
        return new Page<>(content,page,PAGE_SIZE,total);
    }
}
