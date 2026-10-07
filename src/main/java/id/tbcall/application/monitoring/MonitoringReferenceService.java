package id.tbcall.application.monitoring;

import id.tbcall.authorization.CurrentActor;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.monitoring.MonitoringReferenceDtos.*;

@Service
@Transactional(readOnly=true)
public class MonitoringReferenceService {
    private static final List<String> RELEVANT_PERMISSIONS=List.of(
            "MONITORING_READ", "MONITORING_MANAGE", "ALERT_READ",
            "ALERT_ACKNOWLEDGE", "ALERT_RESOLVE", "NOTIFICATION_READ_SELF");
    private final MonitoringAccess access;

    public MonitoringReferenceService(MonitoringAccess access) {
        this.access=access;
    }

    public ReferenceData referenceData(CurrentActor actor) {
        // Authorized requests pass an actually-held grant. No relevant grant delegates
        // denial to the existing officer gate, including its authorization-denied audit.
        String permission=RELEVANT_PERMISSIONS.stream().filter(actor.permissions()::contains)
                .findFirst().orElse("MONITORING_READ");
        access.officer(actor,permission);

        // Ordered TBCall workflow/UI labels, not SITB physical-schema or API codes.
        // These options do not select events, dates, frequency, severity or recipients.
        return new ReferenceData(
                List.of(new Option("CLINICAL_REVIEW","Tinjauan klinis"),
                        new Option("WEIGHT_REVIEW","Tinjauan berat badan"),
                        new Option("ADHERENCE_REVIEW","Tinjauan kepatuhan"),
                        new Option("ADVERSE_EVENT_REVIEW","Tinjauan kejadian tidak diinginkan"),
                        new Option("BACTERIOLOGY_FOLLOW_UP","Tindak lanjut bakteriologis"),
                        new Option("SAFETY_MONITORING","Pemantauan keamanan"),
                        new Option("MEDICATION_PICKUP","Pengambilan obat")),
                List.of(new Option("CLINICAL_REVIEW","Tinjauan klinis"),
                        new Option("WEIGHT_REVIEW","Tinjauan berat badan"),
                        new Option("ADHERENCE_REVIEW","Tinjauan kepatuhan"),
                        new Option("ADVERSE_EVENT_REVIEW","Tinjauan kejadian tidak diinginkan"),
                        new Option("MEDICATION_PICKUP","Pengambilan obat")),
                List.of(new Option("DRAFT","Draf"), new Option("ACTIVE","Aktif"),
                        new Option("PAUSED","Dijeda"), new Option("COMPLETED","Selesai"),
                        new Option("CANCELLED","Dibatalkan")),
                List.of(new Option("SCHEDULED","Terjadwal"), new Option("DUE","Jatuh tempo"),
                        new Option("OVERDUE","Terlambat"), new Option("COMPLETED","Selesai"),
                        new Option("CANCELLED","Dibatalkan")),
                List.of(new Option("MONITORING_OVERDUE","Pemantauan terlambat")),
                List.of(new Option("OPEN","Terbuka"), new Option("ACKNOWLEDGED","Diakui"),
                        new Option("RESOLVED","Terselesaikan"), new Option("DISMISSED","Dikesampingkan")),
                List.of(new Option("INFO","Informasi"), new Option("WARNING","Peringatan"),
                        new Option("HIGH","Tinggi"), new Option("CRITICAL","Kritis")),
                List.of(new Option("TREATMENT","Pengobatan"), new Option("TPT","TPT")),
                List.of(new Option("PENDING","Menunggu"), new Option("SENT","Dikirim"),
                        new Option("DELIVERED","Terkirim"), new Option("READ","Dibaca"),
                        new Option("FAILED","Gagal"), new Option("CANCELLED","Dibatalkan")),
                List.of(new Option("IN_APP","Dalam aplikasi")));
    }
}
