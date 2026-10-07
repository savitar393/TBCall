package id.tbcall.application.laboratory;

import id.tbcall.authorization.CurrentActor;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import id.tbcall.application.laboratory.LabDtos.Label;
import id.tbcall.application.laboratory.LabReferenceDtos.ReferenceData;

@Service
@Transactional(readOnly=true)
public class LabReferenceService {
    private final EntityManager em;
    private final LabAccess access;

    public LabReferenceService(EntityManager em,LabAccess access) { this.em=em; this.access=access; }

    public ReferenceData referenceData(CurrentActor actor) {
        access.require(actor,LabAccess.Mode.READ);
        // Fixed labels are TBCall workflow options, not SITB physical codes.
        return new ReferenceData(catalog("LabTestType"),catalog("LabRequestReason"),
                List.of(new Label("DRAFT","Draf"),new Label("REQUESTED","Diminta"),new Label("SENT","Dikirim"),
                        new Label("RECEIVED","Diterima"),new Label("PARTIAL","Hasil sebagian"),
                        new Label("COMPLETED","Selesai"),new Label("CANCELLED","Dibatalkan")),
                List.of(new Label("REGISTRATION","Registrasi"),new Label("CASE","Kasus")),
                List.of(new Label("INTERNAL","Internal"),new Label("EXTERNAL","Eksternal")),
                List.of(new Label("REQUESTED","Diminta"),new Label("RESULT_AVAILABLE","Hasil tersedia"),new Label("CANCELLED","Dibatalkan")),
                List.of(new Label("FINAL","Final"),new Label("CORRECTED","Dikoreksi")));
    }

    private List<Label> catalog(String entity) {
        // Entity names are fixed internal constants; no client-selected query identifiers.
        return em.createQuery("select r.code,r.name from "+entity+" r where r.active=true order by r.code",Object[].class)
                .getResultList().stream().map(row -> new Label((String)row[0],(String)row[1])).toList();
    }
}
