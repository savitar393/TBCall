package id.tbcall.application.treatment;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.authorization.CurrentActor;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.treatment.TreatmentReferenceDtos.*;

@Service
@Transactional(readOnly=true)
public class TreatmentReferenceService {
    private final EntityManager em;
    private final ClinicalAccess access;

    public TreatmentReferenceService(EntityManager em, ClinicalAccess access) {
        this.em=em;
        this.access=access;
    }

    public ReferenceData referenceData(CurrentActor actor) {
        access.officer(actor,"TREATMENT_READ");
        // Fixed labels describe TBCall workflows, not SITB physical-schema/API codes.
        return new ReferenceData(
                regimens(), catalog("Drug"), catalog("TreatmentOutcomeCode"),
                List.of(new Option("PLANNED","Direncanakan"), new Option("ACTIVE","Aktif"),
                        new Option("PAUSED","Dijeda"), new Option("TRANSFERRED","Dialihkan"),
                        new Option("COMPLETED","Selesai"), new Option("STOPPED","Dihentikan"),
                        new Option("CANCELLED","Dibatalkan")),
                List.of(new Option("TAKEN_OBSERVED","Diminum terobservasi"),
                        new Option("TAKEN_SELF_REPORTED","Diminum berdasarkan laporan"),
                        new Option("DISPENSED_HOME","Obat dibawa pulang"),
                        new Option("MISSED","Tidak diminum"), new Option("UNKNOWN","Tidak diketahui")),
                List.of(new Option("DIRECTLY_OBSERVED","Diawasi langsung"),
                        new Option("SELF_ADMINISTERED","Diminum mandiri"), new Option("OTHER","Lainnya")),
                List.of(new Option("SCHEDULED","Terjadwal"), new Option("COMPLETED","Selesai")));
    }

    private List<RegimenOption> regimens() {
        return em.createQuery("""
                select r.code,r.name,r.tbCaseCategoryCode from Regimen r
                where r.active=true and r.regimenKind='TB_TREATMENT' and r.tbCaseCategoryCode is not null
                order by r.tbCaseCategoryCode,r.code
                """,Object[].class).getResultList().stream()
                .map(row -> new RegimenOption((String)row[0],(String)row[1],(String)row[2])).toList();
    }

    private List<Option> catalog(String entity) {
        // Entity names are fixed internal constants, never client-selected identifiers.
        return em.createQuery("select r.code,r.name from "+entity+" r where r.active=true order by r.code",Object[].class)
                .getResultList().stream().map(row -> new Option((String)row[0],(String)row[1])).toList();
    }
}
