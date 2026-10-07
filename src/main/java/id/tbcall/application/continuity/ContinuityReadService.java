package id.tbcall.application.continuity;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.continuity.ContinuityReadDtos.*;

@Service
@Transactional(readOnly=true)
public class ContinuityReadService {
    private final EntityManager em;
    private final ClinicalAccess access;

    public ContinuityReadService(EntityManager em,ClinicalAccess access) {
        this.em=em;
        this.access=access;
    }

    public ReferralPreparation referralPreparation(CurrentActor actor,UUID caseId) {
        access.officer(actor,"REFERRAL_WRITE");
        // Scalar projection deliberately avoids patient hydration and the send command's write locks.
        var cases=em.createQuery("""
                select c.id,c.status,c.caseCategoryCode,f.id,f.name,d.treatmentDisposition,rf.id,rf.name
                from TBCase c join c.currentFacility f
                left join c.confirmingDiagnosis d left join d.referredToFacility rf
                where c.id=:id and f.id in :facilities and f.active=true
                """,Object[].class).setParameter("id",caseId).setParameter("facilities",actor.facilityIds()).getResultList();
        if(cases.isEmpty()) throw ApplicationFailure.missing();
        Object[] owner=cases.getFirst();
        FacilityDisplay destination="REFERRED".equals(owner[5]) && owner[6]!=null
                ? new FacilityDisplay((UUID)owner[6],(String)owner[7]) : null;
        var treatments=em.createQuery("""
                select t.id,t.status,t.startDate,t.plannedEndDate,r.code,r.name
                from Treatment t left join t.regimen r
                where t.tbCase.id=:id and t.status in ('PLANNED','ACTIVE','PAUSED')
                """,Object[].class).setParameter("id",caseId).getResultList();
        // V1's unique open-episode index guarantees at most one result.
        OpenTreatment open=null;
        if(!treatments.isEmpty()) {
            Object[] t=treatments.getFirst();
            open=new OpenTreatment((UUID)t[0],(String)t[1],(LocalDate)t[2],(LocalDate)t[3],(String)t[4],(String)t[5]);
        }
        boolean inFlight=em.createQuery("select count(r) from Referral r where r.tbCase.id=:id and r.status in ('SENT','RECEIVED')",Long.class)
                .setParameter("id",caseId).getSingleResult()>0;
        return new ReferralPreparation((UUID)owner[0],(String)owner[1],(String)owner[2],
                new FacilityDisplay((UUID)owner[3],(String)owner[4]),destination,open,inFlight);
    }

    public FacilityPage facilities(CurrentActor actor,int page,int size,String query) {
        access.officer(actor,actor.permissions().contains("REFERRAL_WRITE") ? "REFERRAL_WRITE" : "CONTACT_WRITE");
        if(page<0 || size<1 || size>50 || (long)page*size>Integer.MAX_VALUE)
            throw ApplicationFailure.invalid("Halaman tidak valid; ukuran halaman harus 1 sampai 50.");
        String search=query==null ? null : query.trim();
        if(search!=null && (search.length()<2 || search.length()>255))
            throw ApplicationFailure.invalid("Pencarian fasilitas harus berisi 2 sampai 255 karakter.");
        String where=" where f.active=true";
        if(search!=null) where+=" and lower(f.name) like :query escape '!'";
        var count=em.createQuery("select count(f) from Facility f"+where,Long.class);
        var rows=em.createQuery("select f.id,f.name,f.facilityTypeCode,f.provinceCode,f.regencyCode from Facility f"+where+" order by f.name,f.id",Object[].class);
        if(search!=null) {
            String literal="%"+search.toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            count.setParameter("query",literal);
            rows.setParameter("query",literal);
        }
        long total=count.getSingleResult();
        var content=rows.setFirstResult(page*size).setMaxResults(size).getResultList().stream()
                .map(f -> new FacilityOption((UUID)f[0],(String)f[1],(String)f[2],(String)f[3],(String)f[4])).toList();
        return new FacilityPage(content,page,size,total);
    }

    public ReferralReferences referralReferences(CurrentActor actor) {
        access.officer(actor,"REFERRAL_READ");
        // All fixed options describe TBCall workflows, not official SITB physical or API codes.
        return new ReferralReferences(
                List.of(new Option("PRE_TREATMENT_REFERRAL","Rujukan sebelum pengobatan"),
                        new Option("TREATMENT_TRANSFER","Alih pengobatan")),
                List.of(new Option("DRAFT","Draf"),new Option("SENT","Dikirim"),
                        new Option("RECEIVED","Diterima"),new Option("REPORTED","Pasien dilaporkan datang"),
                        new Option("CANCELLED","Dibatalkan"),new Option("RETURNED","Dikembalikan")));
    }

    public ContactReferences contactReferences(CurrentActor actor) {
        access.officer(actor,"CONTACT_READ");
        return new ContactReferences(
                List.of(new Option("INTERNAL","Internal"),new Option("INCOMING_REFERRAL","Rujukan masuk"),
                        new Option("OUTGOING_REFERRAL","Rujukan keluar")),
                List.of(new Option("INTERNAL","Internal"),new Option("OUTGOING_REFERRAL","Rujukan keluar")),
                List.of(new Option("NEW","Baru"),new Option("SENT","Dikirim"),new Option("RECEIVED","Diterima"),
                        new Option("IN_PROGRESS","Sedang diinvestigasi"),new Option("COMPLETED","Selesai"),
                        new Option("RETURNED","Dikembalikan"),new Option("CANCELLED","Dibatalkan")));
    }

    public TptReferences tptReferences(CurrentActor actor) {
        access.officer(actor,actor.permissions().contains("TPT_READ") ? "TPT_READ" : "TPT_WRITE");
        var regimens=em.createQuery("""
                select r.code,r.name,r.tbCaseCategoryCode from Regimen r
                where r.active=true and r.regimenKind='PREVENTIVE' and r.tbCaseCategoryCode is not null
                order by r.tbCaseCategoryCode,r.code
                """,Object[].class).getResultList().stream()
                .map(r -> new RegimenOption((String)r[0],(String)r[1],(String)r[2])).toList();
        return new TptReferences(regimens,
                List.of(new Option("PLANNED","Direncanakan"),new Option("ACTIVE","Aktif"),
                        new Option("COMPLETED","Selesai"),new Option("STOPPED","Dihentikan"),
                        new Option("LOST_TO_FOLLOW_UP","Putus tindak lanjut"),new Option("CANCELLED","Dibatalkan")),
                List.of(new Option("DAY","Hari"),new Option("WEEK","Minggu"),new Option("MONTH","Bulan")));
    }
}
