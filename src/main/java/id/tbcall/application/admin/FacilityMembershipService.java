package id.tbcall.application.admin;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.admin.AdminDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class FacilityMembershipService {
    private final EntityManager em;
    private final AdministrativePolicies policies;
    private final AdministrativeUsers users;
    private final AuditService audit;
    private final Clock clock;
    public FacilityMembershipService(EntityManager em, AdministrativePolicies policies, AdministrativeUsers users, AuditService audit, Clock clock) {
        this.em=em; this.policies=policies; this.users=users; this.audit=audit; this.clock=clock;
    }
    public MembershipResponse assign(CurrentActor actor, UUID facilityId, UUID userId, boolean primary) {
        policies.requireFacilityMembership(actor,facilityId); activeFacility(facilityId); users.activeVerified(userId);
        var assignments=em.createQuery("select uf from UserFacility uf where uf.userId=:user",UserFacility.class).setParameter("user",userId).getResultList();
        boolean primaryChanged=false;
        if(primary) {
            for(UserFacility prior:assignments) if(!prior.getFacilityId().equals(facilityId) && Boolean.TRUE.equals(prior.getIsPrimary())) {
                prior.setIsPrimary(false); primaryChanged=true;
            }
            // Clear prior primary before inserting/updating the next one; both flushes remain atomic on commit.
            em.flush();
        }
        UserFacility target=em.find(UserFacility.class,key(userId,facilityId));
        boolean created=target==null;
        if(created) {
            target=new UserFacility(); target.setUserId(userId); target.setFacilityId(facilityId); target.setAssignedAt(OffsetDateTime.now(clock));
        }
        primaryChanged |= Boolean.TRUE.equals(target.getIsPrimary())!=primary;
        target.setActive(true); target.setIsPrimary(primary); if(created) em.persist(target);
        audit.record(actor.userId(),"FACILITY_USER_ASSIGNED","USER",userId);
        if(primaryChanged) audit.record(actor.userId(),"PRIMARY_FACILITY_CHANGED","USER",userId);
        em.flush(); return new MembershipResponse(userId,facilityId,true,primary);
    }
    public MembershipResponse remove(CurrentActor actor, UUID facilityId, UUID userId) {
        policies.requireFacilityMembership(actor,facilityId); activeFacility(facilityId); users.lock(userId);
        UserFacility target=em.find(UserFacility.class,key(userId,facilityId));
        if(target==null || !Boolean.TRUE.equals(target.getActive())) return new MembershipResponse(userId,facilityId,false,false);
        if(!actor.hasRole("SYSTEM_ADMIN") && actor.userId().equals(userId)) {
            long others=em.createQuery("""
                    select count(uf) from UserFacility uf where uf.userId=:user and uf.facilityId<>:facility
                    and uf.active=true and uf.facility.active=true
                    """,Long.class).setParameter("user",userId).setParameter("facility",facilityId).getSingleResult();
            if(others==0) throw ApplicationFailure.conflict("Administrator fasyankes tidak dapat mencabut penugasan aktif terakhirnya sendiri.");
        }
        boolean primary=Boolean.TRUE.equals(target.getIsPrimary()); target.setActive(false); target.setIsPrimary(false);
        audit.record(actor.userId(),"FACILITY_USER_REMOVED","USER",userId);
        if(primary) audit.record(actor.userId(),"PRIMARY_FACILITY_CHANGED","USER",userId);
        em.flush(); return new MembershipResponse(userId,facilityId,false,false);
    }
    private void activeFacility(UUID id) {
        Facility facility=em.find(Facility.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(facility==null) throw ApplicationFailure.missing();
        if(!Boolean.TRUE.equals(facility.getActive())) throw ApplicationFailure.conflict("Fasyankes tidak aktif.");
    }
    private UserFacility.Key key(UUID user, UUID facility) {
        UserFacility.Key key=new UserFacility.Key(); key.userId=user; key.facilityId=facility; return key;
    }
}
