package id.tbcall.application.laboratory;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.LabRequest;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.laboratory.LabDtos.*;

@Service
// A request ETag, its child versions and completeness describe one database snapshot.
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class LabQueryService {
    private final EntityManager em;
    private final LabAccess access;
    private final LabViews views;
    public LabQueryService(EntityManager em,LabAccess access,LabViews views) { this.em=em; this.access=access; this.views=views; }
    public RequestDetail detail(CurrentActor actor,UUID id) { return views.detail(actor,access.request(actor,id,LabAccess.Mode.READ,false)); }
    public RequestPage list(CurrentActor actor,Filters filters) {
        access.require(actor,LabAccess.Mode.READ);
        long offset=(long)filters.page()*filters.size();
        if(filters.page()<0 || filters.size()<1 || filters.size()>50 || offset>Integer.MAX_VALUE) throw ApplicationFailure.invalid("Halaman tidak negatif dan ukuran halaman 1 sampai 50.");
        if(filters.status()!=null && !Set.of("DRAFT","REQUESTED","SENT","RECEIVED","PARTIAL","COMPLETED","CANCELLED").contains(filters.status())) throw ApplicationFailure.invalid("Status permintaan tidak dikenal.");
        if(filters.ownerType()!=null && !Set.of("REGISTRATION","CASE").contains(filters.ownerType())) throw ApplicationFailure.invalid("Jenis pemilik tidak dikenal.");
        for(UUID id:new UUID[]{filters.testingFacilityId(),filters.requestingFacilityId()}) if(id!=null && !actor.facilityIds().contains(id)) throw ApplicationFailure.missing();
        String where=" where "+LabAccess.READ_SCOPE; Map<String,Object> parameters=new LinkedHashMap<>();
        if(filters.status()!=null) { where+=" and r.status=:status"; parameters.put("status",filters.status()); }
        if(filters.testingFacilityId()!=null) { where+=" and r.testingFacility.id=:testing"; parameters.put("testing",filters.testingFacilityId()); }
        if(filters.requestingFacilityId()!=null) { where+=" and r.requestingFacility.id=:requesting"; parameters.put("requesting",filters.requestingFacilityId()); }
        if(filters.requestReasonCode()!=null) { where+=" and r.requestReasonCode=:reason"; parameters.put("reason",filters.requestReasonCode()); }
        if(filters.ownerType()!=null) where+=" and r."+("REGISTRATION".equals(filters.ownerType()) ? "registration" : "tbCase")+" is not null";
        var count=access.scope(em.createQuery("select count(r) from LabRequest r"+where,Long.class),actor,LabAccess.Mode.READ);
        var query=access.scope(em.createQuery("""
                select r from LabRequest r join fetch r.requestingFacility join fetch r.testingFacility
                left join fetch r.registration reg left join fetch reg.patient
                left join fetch r.tbCase c left join fetch c.registration cr left join fetch cr.patient
                """+where+" order by r.requestedAt desc,r.id",LabRequest.class),actor,LabAccess.Mode.READ);
        parameters.forEach((key,value) -> { count.setParameter(key,value); query.setParameter(key,value); });
        return new RequestPage(views.summaries(query.setFirstResult((int)offset).setMaxResults(filters.size()).getResultList()),filters.page(),filters.size(),count.getSingleResult());
    }
}
