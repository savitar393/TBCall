package id.tbcall.application.admin;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.AdministrativePolicies;
import id.tbcall.authorization.CurrentActor;
import jakarta.persistence.EntityManager;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.admin.AdminDtos.*;

@Service
@Transactional(readOnly=true)
public class AdministrationReadService {
    private final EntityManager em;
    private final AdministrativePolicies policies;

    public AdministrationReadService(EntityManager em, AdministrativePolicies policies) {
        this.em=em;
        this.policies=policies;
    }

    public FacilityPage facilities(CurrentActor actor, int page, int size, String query, Boolean active) {
        policies.requireSystem(actor,"FACILITY_MANAGE");
        if(page<0 || size<1 || size>50 || (long)page*size>Integer.MAX_VALUE)
            throw ApplicationFailure.invalid("Halaman tidak valid; ukuran halaman harus 1 sampai 50.");
        String search=query==null ? null : query.trim();
        if(search!=null && (search.length()<2 || search.length()>255))
            throw ApplicationFailure.invalid("Pencarian fasilitas harus berisi 2 sampai 255 karakter.");

        String where=" where 1=1";
        if(active!=null) where+=" and f.active=:active";
        if(search!=null) where+=" and lower(f.name) like :query escape '!'";
        var count=em.createQuery("select count(f) from Facility f"+where,Long.class);
        // Scalar projection excludes versions, address, coordinates and memberships.
        var rows=em.createQuery("select f.id,f.name,f.facilityTypeCode,parent.id,f.provinceCode,f.regencyCode,f.active"
                +" from Facility f left join f.parentFacility parent"+where+" order by f.name,f.id",Object[].class);
        if(active!=null) { count.setParameter("active",active); rows.setParameter("active",active); }
        if(search!=null) {
            String literal="%"+search.toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            count.setParameter("query",literal);
            rows.setParameter("query",literal);
        }
        long total=count.getSingleResult();
        var content=rows.setFirstResult(page*size).setMaxResults(size).getResultList().stream()
                .map(f -> new FacilitySummary((UUID)f[0],(String)f[1],(String)f[2],(UUID)f[3],
                        (String)f[4],(String)f[5],Boolean.TRUE.equals(f[6]))).toList();
        return new FacilityPage(content,page,size,total);
    }

    public ReferenceData referenceData(CurrentActor actor) {
        policies.requireReferenceData(actor);
        // Database labels describe TBCall administration vocabulary, not SITB groups.
        var types=em.createQuery("select new id.tbcall.application.admin.AdminDtos$ReferenceOption(t.code,t.name)"
                +" from FacilityType t where t.active=true order by t.code",ReferenceOption.class).getResultList();
        var roles=em.createQuery("select new id.tbcall.application.admin.AdminDtos$ReferenceOption(r.code,r.name)"
                +" from Role r where r.code in :codes order by r.code",ReferenceOption.class)
                .setParameter("codes",UserAdministrationService.ADMIN_MANAGED).getResultList();
        return new ReferenceData(types,roles);
    }
}
