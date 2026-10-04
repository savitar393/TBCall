package id.tbcall.application.referral;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class ReferralAccess {
    public enum Side { SOURCE,DESTINATION,BOTH }
    private final EntityManager em;
    private final ClinicalAccess clinical;
    public ReferralAccess(EntityManager em,ClinicalAccess clinical) { this.em=em; this.clinical=clinical; }
    public void officer(CurrentActor actor,String permission) { clinical.officer(actor,permission); }
    public TBCase sendCase(CurrentActor actor,UUID id) {
        officer(actor,"REFERRAL_WRITE");
        var ids=em.createQuery("select c.id from TBCase c where c.id=:id and c.currentFacility.id in :facilities and c.currentFacility.active=true",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing();
        TBCase owner=em.find(TBCase.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(!assigned(actor,owner.getCurrentFacility())) throw ApplicationFailure.missing();
        return owner;
    }
    public Treatment treatment(TBCase owner,UUID id) {
        var owners=em.createQuery("select t.tbCase.id from Treatment t where t.id=:id",UUID.class).setParameter("id",id).getResultList();
        if(owners.isEmpty() || !owners.getFirst().equals(owner.getId())) throw ReferralErrors.mismatch();
        return em.find(Treatment.class,id,LockModeType.PESSIMISTIC_WRITE);
    }
    public Referral existing(CurrentActor actor,UUID id,Side side,boolean lock) {
        officer(actor,lock ? "REFERRAL_WRITE" : "REFERRAL_READ");
        // Scalar IDs avoid hydrating stale parent entities before waiting for the shared case lock.
        var rows=em.createQuery("select r.tbCase.id,t.id from Referral r left join r.treatment t where r.id=:id and "+scope(side),Object[].class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(rows.isEmpty()) throw ApplicationFailure.missing();
        if(lock) {
            em.find(TBCase.class,(UUID)rows.getFirst()[0],LockModeType.PESSIMISTIC_WRITE);
            if(rows.getFirst()[1]!=null) em.find(Treatment.class,(UUID)rows.getFirst()[1],LockModeType.PESSIMISTIC_WRITE);
        }
        Referral referral=lock ? em.find(Referral.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(Referral.class,id);
        boolean allowed=switch(side) {
            case SOURCE -> assigned(actor,referral.getSourceFacility());
            case DESTINATION -> assigned(actor,referral.getDestinationFacility());
            case BOTH -> assigned(actor,referral.getSourceFacility()) || assigned(actor,referral.getDestinationFacility());
        };
        if(!allowed) throw ApplicationFailure.missing();
        return referral;
    }
    public static String scope(Side side) {
        String source="(r.sourceFacility.id in :facilities and r.sourceFacility.active=true)",destination="(r.destinationFacility.id in :facilities and r.destinationFacility.active=true)";
        return switch(side) { case SOURCE -> source; case DESTINATION -> destination; case BOTH -> "("+source+" or "+destination+")"; };
    }
    public Facility destination(UUID id,UUID source) {
        if(id==null || id.equals(source)) throw ReferralErrors.destination();
        Facility facility=em.find(Facility.class,id,LockModeType.PESSIMISTIC_READ);
        if(facility==null || !Boolean.TRUE.equals(facility.getActive())) throw ReferralErrors.destination();
        return facility;
    }
    private boolean assigned(CurrentActor actor,Facility facility) { return actor.facilityIds().contains(facility.getId()) && Boolean.TRUE.equals(facility.getActive()); }
}
