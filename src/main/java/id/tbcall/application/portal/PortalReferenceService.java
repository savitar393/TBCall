package id.tbcall.application.portal;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.CurrentActor;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.portal.PortalReferenceDtos.*;

@Service
@Transactional(readOnly = true)
public class PortalReferenceService {
    private static final List<String> RELEVANT_PERMISSIONS = List.of(
            "TREATMENT_READ", "ADHERENCE_READ", "ADHERENCE_RECORD", "FOLLOW_UP_READ", "TPT_READ",
            "MONITORING_READ", "ALERT_READ", "ALERT_ACKNOWLEDGE", "NOTIFICATION_READ_SELF");
    private final AuditService audit;

    public PortalReferenceService(AuditService audit) {
        this.audit = audit;
    }

    public ReferenceData referenceData(CurrentActor actor) {
        boolean portalRole = actor.hasRole("PATIENT") || actor.hasRole("TREATMENT_SUPPORTER");
        boolean relevantGrant = RELEVANT_PERMISSIONS.stream().anyMatch(actor.permissions()::contains);
        if (!portalRole || !relevantGrant) {
            audit.authorizationDenied(actor.userId());
            throw ApplicationFailure.forbidden();
        }

        // Ordered TBCall UI/workflow vocabulary, not SITB physical-schema or API codes.
        // Resource linkage, treatment selection and write validation remain in their existing services.
        return new ReferenceData(
                List.of(new Option("PLANNED", "Direncanakan"), new Option("ACTIVE", "Aktif"),
                        new Option("PAUSED", "Dijeda"), new Option("TRANSFERRED", "Dialihkan"),
                        new Option("COMPLETED", "Selesai"), new Option("STOPPED", "Dihentikan"),
                        new Option("CANCELLED", "Dibatalkan")),
                List.of(new Option("PLANNED", "Direncanakan"), new Option("ACTIVE", "Aktif"),
                        new Option("COMPLETED", "Selesai"), new Option("STOPPED", "Dihentikan"),
                        new Option("LOST_TO_FOLLOW_UP", "Putus tindak lanjut"), new Option("CANCELLED", "Dibatalkan")),
                List.of(new Option("TAKEN_SELF_REPORTED", "Diminum berdasarkan laporan sendiri"),
                        new Option("MISSED", "Tidak diminum"), new Option("UNKNOWN", "Tidak diketahui")),
                List.of(new Option("TAKEN_OBSERVED", "Diminum terobservasi"),
                        new Option("TAKEN_SELF_REPORTED", "Diminum berdasarkan laporan"),
                        new Option("MISSED", "Tidak diminum"), new Option("UNKNOWN", "Tidak diketahui")),
                List.of(new Option("DIRECTLY_OBSERVED", "Diawasi langsung"),
                        new Option("SELF_ADMINISTERED", "Diminum mandiri"), new Option("OTHER", "Lainnya")),
                List.of(new Option("SCHEDULED", "Terjadwal"), new Option("COMPLETED", "Selesai")),
                List.of(new Option("CLINICAL_REVIEW", "Tinjauan klinis"),
                        new Option("WEIGHT_REVIEW", "Tinjauan berat badan"),
                        new Option("ADHERENCE_REVIEW", "Tinjauan kepatuhan"),
                        new Option("ADVERSE_EVENT_REVIEW", "Tinjauan kejadian tidak diinginkan"),
                        new Option("BACTERIOLOGY_FOLLOW_UP", "Tindak lanjut bakteriologis"),
                        new Option("SAFETY_MONITORING", "Pemantauan keamanan"),
                        new Option("MEDICATION_PICKUP", "Pengambilan obat")),
                List.of(new Option("CLINICAL_REVIEW", "Tinjauan klinis"),
                        new Option("WEIGHT_REVIEW", "Tinjauan berat badan"),
                        new Option("ADHERENCE_REVIEW", "Tinjauan kepatuhan"),
                        new Option("ADVERSE_EVENT_REVIEW", "Tinjauan kejadian tidak diinginkan"),
                        new Option("MEDICATION_PICKUP", "Pengambilan obat")),
                List.of(new Option("SCHEDULED", "Terjadwal"), new Option("DUE", "Jatuh tempo"),
                        new Option("OVERDUE", "Terlambat"), new Option("COMPLETED", "Selesai"),
                        new Option("CANCELLED", "Dibatalkan")),
                List.of(new Option("MONITORING_OVERDUE", "Pemantauan terlambat")),
                List.of(new Option("OPEN", "Terbuka"), new Option("ACKNOWLEDGED", "Diakui"),
                        new Option("RESOLVED", "Terselesaikan"), new Option("DISMISSED", "Dikesampingkan")),
                List.of(new Option("INFO", "Informasi"), new Option("WARNING", "Peringatan"),
                        new Option("HIGH", "Tinggi"), new Option("CRITICAL", "Kritis")),
                List.of(new Option("PENDING", "Menunggu"), new Option("SENT", "Dikirim"),
                        new Option("DELIVERED", "Terkirim"), new Option("READ", "Dibaca"),
                        new Option("FAILED", "Gagal"), new Option("CANCELLED", "Dibatalkan")),
                List.of(new Option("IN_APP", "Dalam aplikasi")));
    }
}
