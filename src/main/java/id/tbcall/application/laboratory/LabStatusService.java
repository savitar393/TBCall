package id.tbcall.application.laboratory;

import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

/** All callers hold the request write lock before changing children or aggregating. */
@Component
@Transactional(propagation=Propagation.MANDATORY)
public class LabStatusService {
    private final EntityManager em;
    public LabStatusService(EntityManager em) { this.em=em; }
    public List<LabRequestTest> tests(LabRequest request) {
        return em.createQuery("select t from LabRequestTest t where t.labRequest.id=:id order by t.createdAt,t.id",LabRequestTest.class)
                .setParameter("id",request.getId()).getResultList();
    }
    public boolean hasFinalResult(LabRequest request) {
        return em.createQuery("select count(v) from LabResult v where v.labRequestTest.labRequest.id=:id and v.status in ('FINAL','CORRECTED')",Long.class)
                .setParameter("id",request.getId()).getSingleResult()>0;
    }
    public void recompute(LabRequest request) {
        if("CANCELLED".equals(request.getStatus())) return;
        // Flush appended results before querying completeness. V6 remains the lineage guard.
        em.flush();
        Set<UUID> completed=new HashSet<>(em.createQuery("select distinct v.labRequestTest.id from LabResult v where v.labRequestTest.labRequest.id=:id and v.status in ('FINAL','CORRECTED')",UUID.class)
                .setParameter("id",request.getId()).getResultList());
        var tests=tests(request); int required=0,available=0;
        for(var test:tests) {
            if("CANCELLED".equals(test.getStatus())) continue;
            required++;
            if(completed.contains(test.getId())) { test.setStatus("RESULT_AVAILABLE"); available++; }
        }
        if(required>0 && available==required) request.setStatus("COMPLETED");
        else if(available>0) request.setStatus("PARTIAL");
        else if(specimensWith(request,"s.receivedAt is not null")>0) request.setStatus("RECEIVED");
        else if("EXTERNAL".equals(request.getReferralType()) && specimensWith(request,"s.sentAt is not null")>0) request.setStatus("SENT");
    }
    private long specimensWith(LabRequest request,String predicate) {
        return em.createQuery("select count(s) from LabSpecimen s where s.labRequest.id=:id and "+predicate,Long.class)
                .setParameter("id",request.getId()).getSingleResult();
    }
    public void advanceVersions(LabRequest request,long before,LabRequestTest test,long testBefore) {
        em.flush();
        // A child-only write still invalidates the aggregate ETag. Avoid a second increment
        // when ordinary Hibernate dirty checking has already advanced the version.
        if(test!=null && test.getVersion()==testBefore) em.lock(test,LockModeType.PESSIMISTIC_FORCE_INCREMENT);
        if(request.getVersion()==before) em.lock(request,LockModeType.PESSIMISTIC_FORCE_INCREMENT);
        em.flush();
    }
}
