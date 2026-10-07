package id.tbcall.application.clinical;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDirectoryDtos.*;
import id.tbcall.application.clinical.ClinicalDtos.Label;

@Service
@Transactional(readOnly=true,isolation=Isolation.READ_COMMITTED)
public class ClinicalDirectoryService {
    private final EntityManager em;
    private final ClinicalAccess access;
    public ClinicalDirectoryService(EntityManager em,ClinicalAccess access) { this.em=em; this.access=access; }

    public ReferenceData referenceData(CurrentActor actor) {
        access.officer(actor,"PATIENT_READ");
        return new ReferenceData(catalog("SexCode"),catalog("TBSuspectType"),catalog("PreviousTreatmentCategory"),
                catalog("HivStatus"),catalog("DmStatus"),catalog("AnatomicalSite"),catalog("DiagnosisType"),catalog("TBCaseCategory"),
                catalog("DrugResistancePattern"),catalog("PregnancyStatus"),catalog("BcgStatus"),
                List.of(new Label("WNI","Warga Negara Indonesia"),new Label("WNA","Warga Negara Asing")),
                List.of(new Label("TREAT_HERE","Diobati di fasyankes ini"),new Label("REFERRED","Dirujuk ke fasyankes lain"),
                        new Label("NOT_TREATED","Tidak diobati"),new Label("UNKNOWN","Belum ditentukan")),
                List.of(new Label("OPEN","Terbuka"),new Label("DIAGNOSED","Sudah didiagnosis")),
                List.of(new Label("ACTIVE","Aktif"),new Label("REFERRED","Dirujuk")));
    }
    private List<Label> catalog(String entity) {
        // Entity names are fixed internal constants; callers cannot select a table.
        return em.createQuery("select r.code,r.name from "+entity+" r where r.active=true order by r.code",Object[].class)
                .getResultList().stream().map(row -> new Label((String)row[0],(String)row[1])).toList();
    }
    public FacilityPage facilities(CurrentActor actor,int page,int size,String query) {
        access.officer(actor,"PATIENT_READ");
        if(page<0 || size<1 || size>50 || (long)page*size>Integer.MAX_VALUE)
            throw ApplicationFailure.invalid("Halaman harus non-negatif dan ukuran halaman 1–50.");
        String search=query==null ? null : query.strip();
        if(search!=null && (search.length()<2 || search.length()>255))
            throw ApplicationFailure.invalid("Pencarian fasyankes harus berisi 2–255 karakter.");
        String where=" where f.active=true";
        if(search!=null) where+=" and lower(f.name) like :query escape '!'";
        var count=em.createQuery("select count(f) from Facility f"+where,Long.class);
        var results=em.createQuery("select f.id,f.name,f.facilityTypeCode,f.provinceCode,f.regencyCode from Facility f"+where+" order by f.name,f.id",Object[].class);
        if(search!=null) {
            String pattern="%"+search.toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            count.setParameter("query",pattern); results.setParameter("query",pattern);
        }
        long total=count.getSingleResult();
        var content=results.setFirstResult(page*size).setMaxResults(size).getResultList().stream()
                .map(row -> new FacilityEntry((UUID)row[0],(String)row[1],(String)row[2],(String)row[3],(String)row[4])).toList();
        return new FacilityPage(content,page,size,total);
    }
}
