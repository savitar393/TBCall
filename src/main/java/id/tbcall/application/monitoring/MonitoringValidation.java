package id.tbcall.application.monitoring;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.*;
import java.time.*;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class MonitoringValidation {
    private static final Set<String> TREATMENT=Set.of("CLINICAL_REVIEW","WEIGHT_REVIEW","ADHERENCE_REVIEW","ADVERSE_EVENT_REVIEW","BACTERIOLOGY_FOLLOW_UP","SAFETY_MONITORING","MEDICATION_PICKUP");
    private static final Set<String> TPT=Set.of("CLINICAL_REVIEW","WEIGHT_REVIEW","ADHERENCE_REVIEW","ADVERSE_EVENT_REVIEW","MEDICATION_PICKUP");
    private final Clock clock;
    public MonitoringValidation(Clock clock) { this.clock=clock; }
    public OffsetDateTime now() { return OffsetDateTime.now(clock); }
    public void plan(MonitoringPlan p,MonitoringAccess.Target target) {
        if(p.getStartDate()==null || p.getStartDate().isBefore(target.startDate()) || p.getStartDate().isAfter(LocalDate.now(clock))
                || (p.getEndDate()!=null && (p.getEndDate().isBefore(p.getStartDate()) || (target.plannedEndDate()!=null && p.getEndDate().isAfter(target.plannedEndDate()))))) invalid();
    }
    public void event(MonitoringEvent e) {
        MonitoringPlan p=e.getMonitoringPlan(); var codes=p.getTreatment()!=null ? TREATMENT : TPT;
        if(!codes.contains(e.getEventType()) || e.getScheduledAt()==null || (e.getDueAt()!=null && e.getDueAt().isBefore(e.getScheduledAt()))) invalid();
        // Calendar bounds use the injected Clock zone, not a caller-chosen timestamp offset.
        if(date(e.getScheduledAt()).isBefore(p.getStartDate()) || (p.getEndDate()!=null && (date(e.getScheduledAt()).isAfter(p.getEndDate()) || (e.getDueAt()!=null && date(e.getDueAt()).isAfter(p.getEndDate()))))) invalid();
    }
    private LocalDate date(OffsetDateTime value) { return value.atZoneSameInstant(clock.getZone()).toLocalDate(); }
    public String status(MonitoringEvent e) { if(e.getDueAt()!=null && now().isAfter(e.getDueAt())) return "OVERDUE"; return now().isBefore(e.getScheduledAt()) ? "SCHEDULED" : "DUE"; }
    private void invalid() { throw ApplicationFailure.invalid("Tanggal atau kode pemantauan tidak valid."); }
}
