package id.tbcall.application.laboratory;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class LabAccess {
    public enum Mode { READ, SOURCE, LAB }
    public static final String READ_SCOPE="((:officer=true and r.requestingFacility.id in :facilities and r.requestingFacility.active=true) or (:lab=true and r.testingFacility.id in :facilities and r.testingFacility.active=true))";
    private final EntityManager em;
    private final AuditService audit;
    public LabAccess(EntityManager em,AuditService audit) { this.em=em; this.audit=audit; }
    public boolean officer(CurrentActor actor,String permission) { return actor.hasRole("TB_OFFICER") && actor.permissions().contains(permission); }
    public boolean lab(CurrentActor actor,String permission) { return actor.hasRole("LAB_STAFF") && actor.permissions().contains(permission); }
    public void require(CurrentActor actor,Mode mode) {
        boolean allowed=switch(mode) {
            case READ -> officer(actor,"LAB_REQUEST_READ") || lab(actor,"LAB_REQUEST_READ");
            case SOURCE -> officer(actor,"LAB_REQUEST_WRITE");
            case LAB -> lab(actor,"LAB_RESULT_WRITE");
        };
        if(!allowed || actor.facilityIds().isEmpty()) { audit.authorizationDenied(actor.userId()); throw ApplicationFailure.forbidden(); }
    }
    public <T> TypedQuery<T> scope(TypedQuery<T> query,CurrentActor actor,Mode mode) {
        query.setParameter("facilities",actor.facilityIds());
        if(mode==Mode.READ) query.setParameter("officer",officer(actor,"LAB_REQUEST_READ")).setParameter("lab",lab(actor,"LAB_REQUEST_READ"));
        return query;
    }
    public String predicate(Mode mode) {
        return switch(mode) {
            case READ -> READ_SCOPE;
            case SOURCE -> "r.requestingFacility.id in :facilities and r.requestingFacility.active=true";
            case LAB -> "r.testingFacility.id in :facilities and r.testingFacility.active=true";
        };
    }
    public LabRequest request(CurrentActor actor,UUID id,Mode mode,boolean lock) {
        require(actor,mode);
        var ids=scope(em.createQuery("select r.id from LabRequest r where r.id=:id and "+predicate(mode),UUID.class).setParameter("id",id),actor,mode).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing();
        // Scalar lookup does not cache stale entity state before a lock wait.
        return lock ? em.find(LabRequest.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(LabRequest.class,id);
    }
    public UUID specimenRequest(CurrentActor actor,UUID id) { return parent(actor,id,"select r.id from LabSpecimen s join s.labRequest r where s.id=:id and "); }
    public UUID testRequest(CurrentActor actor,UUID id) { return parent(actor,id,"select r.id from LabRequestTest t join t.labRequest r where t.id=:id and "); }
    public UUID resultRequest(CurrentActor actor,UUID id) { return parent(actor,id,"select r.id from LabResult v join v.labRequestTest t join t.labRequest r where v.id=:id and "); }
    private UUID parent(CurrentActor actor,UUID id,String query) {
        require(actor,Mode.LAB);
        var ids=scope(em.createQuery(query+predicate(Mode.LAB),UUID.class).setParameter("id",id),actor,Mode.LAB).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing(); return ids.getFirst();
    }
    public TBCase caseOwner(CurrentActor actor,UUID id) {
        require(actor,Mode.SOURCE);
        var ids=em.createQuery("select c.id from TBCase c where c.id=:id and c.currentFacility.id in :facilities and c.currentFacility.active=true",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing(); return em.find(TBCase.class,id,LockModeType.PESSIMISTIC_WRITE);
    }
}
