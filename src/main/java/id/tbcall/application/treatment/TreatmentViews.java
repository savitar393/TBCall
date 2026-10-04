package id.tbcall.application.treatment;

import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.treatment.TreatmentDtos.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class TreatmentViews {
    private final EntityManager em;
    public TreatmentViews(EntityManager em) { this.em=em; }
    public FacilityView facility(Facility facility) { return facility==null ? null : new FacilityView(facility.getId(),facility.getName()); }
    private Label regimen(Treatment t) { return t.getRegimen()==null ? null : new Label(t.getRegimen().getCode(),t.getRegimen().getName()); }
    public TreatmentDetail staff(Treatment t,Set<String> permissions) {
        Patient p=t.getTbCase().getRegistration().getPatient();
        return new TreatmentDetail(t.getId(),t.getVersion(),t.getTbCase().getId(),new PatientContext(p.getId(),p.getFullName()),facility(t.getFacility()),regimen(t),t.getStatus(),
                t.getStartDate(),t.getPlannedEndDate(),t.getActualEndDate(),t.getInitialWeightKg(),t.getOatForm(),t.getDrugSource(),t.getIntensiveStartDate(),t.getIntensiveEndDate(),t.getContinuationStartDate(),t.getContinuationEndDate(),t.getRegimenDescription(),t.getNotes(),
                drugs(t).stream().map(this::drug).toList(),
                permissions.contains("ADHERENCE_READ") ? summary(t) : null,
                permissions.contains("ADHERENCE_READ") ? recent(t).stream().map(this::dose).toList() : List.of(),
                permissions.contains("FOLLOW_UP_READ") ? follows(t).stream().map(this::followUp).toList() : List.of(),
                permissions.contains("ADVERSE_EVENT_READ") ? events(t).stream().map(this::adverse).toList() : List.of(),
                permissions.contains("OUTCOME_READ") ? outcomeFor(t) : null,
                permissions.contains("LAB_REQUEST_READ") ? labs(t) : List.of());
    }
    public PatientTreatment patient(Treatment t,Set<String> permissions) {
        OutcomeView outcome=permissions.contains("OUTCOME_READ") ? outcomeFor(t) : null;
        return new PatientTreatment(t.getId(),t.getStatus(),regimen(t),t.getStartDate(),t.getPlannedEndDate(),t.getActualEndDate(),
                drugs(t).stream().map(this::safeDrug).toList(),permissions.contains("ADHERENCE_READ") ? recent(t).stream().map(this::safeDose).toList() : List.of(),
                outcome==null ? null : new SafeOutcome(outcome.outcomeCode(),outcome.outcomeName(),outcome.outcomeDate()),
                permissions.contains("ADVERSE_EVENT_READ") ? events(t).stream().map(e -> new SafeAdverse(e.getEventType(),e.getSeverity(),Boolean.TRUE.equals(e.getSerious()),e.getReportedAt(),e.getStartedAt(),e.getEndedAt())).toList() : List.of());
    }
    public SupporterTreatment supporter(Treatment t,Set<String> permissions) {
        return new SupporterTreatment(t.getId(),t.getTbCase().getId(),t.getTbCase().getRegistration().getPatient().getFullName(),t.getStatus(),regimen(t),t.getStartDate(),t.getPlannedEndDate(),
                drugs(t).stream().map(this::safeDrug).toList(),permissions.contains("ADHERENCE_READ") ? summary(t) : null,
                permissions.contains("ADHERENCE_READ") ? recent(t).stream().map(this::safeDose).toList() : List.of());
    }
    private List<TreatmentDrug> drugs(Treatment t) { return em.createQuery("select d from TreatmentDrug d where d.treatment.id=:id order by d.startDate,d.id",TreatmentDrug.class).setParameter("id",t.getId()).getResultList(); }
    private DrugView drug(TreatmentDrug d) { return new DrugView(d.getId(),d.getDrug()==null ? null : d.getDrug().getCode(),d.getDrugNameSnapshot(),d.getTreatmentPhase(),d.getDoseValue(),d.getDoseUnit(),d.getFrequencyPerWeek(),d.getStartDate(),d.getEndDate(),d.getBatchNumber(),d.getDrugSource(),d.getNotes()); }
    private SafeDrug safeDrug(TreatmentDrug d) { return new SafeDrug(d.getDrugNameSnapshot(),d.getTreatmentPhase(),d.getDoseValue(),d.getDoseUnit(),d.getFrequencyPerWeek(),d.getStartDate(),d.getEndDate()); }
    public DoseView dose(DoseEvent d) { return new DoseView(d.getId(),d.getScheduledDate(),d.getRecordedAt(),d.getStatus(),d.getAdministrationMode(),d.getSource(),d.getRecordedByUser()==null ? null : d.getRecordedByUser().getId(),d.getNotes()); }
    public SafeDose safeDose(DoseEvent d) { return new SafeDose(d.getId(),d.getScheduledDate(),d.getRecordedAt(),d.getStatus(),d.getAdministrationMode(),d.getSource()); }
    private List<DoseEvent> recent(Treatment t) { return em.createQuery("select d from DoseEvent d where d.treatment.id=:id order by d.scheduledDate desc,d.recordedAt desc,d.id desc",DoseEvent.class).setParameter("id",t.getId()).setMaxResults(10).getResultList(); }
    private EvidenceSummary summary(Treatment t) {
        var rows=em.createQuery("select d.status,count(d) from DoseEvent d where d.treatment.id=:id group by d.status order by d.status",Object[].class).setParameter("id",t.getId()).getResultList();
        Map<String,Long> counts=new LinkedHashMap<>(); long total=0;
        for(Object[] row:rows) { long count=(Long)row[1]; counts.put((String)row[0],count); total+=count; }
        return new EvidenceSummary(total,Collections.unmodifiableMap(counts));
    }
    private List<FollowUp> follows(Treatment t) { return em.createQuery("select f from FollowUp f where f.treatment.id=:id order by f.scheduledAt,f.id",FollowUp.class).setParameter("id",t.getId()).getResultList(); }
    public FollowUpView followUp(FollowUp f) { return new FollowUpView(f.getId(),f.getVersion(),f.getTreatment().getId(),f.getFollowUpType(),f.getScheduledAt(),f.getCompletedAt(),facility(f.getFacility()),f.getHealthWorker()==null ? null : f.getHealthWorker().getId(),f.getStatus(),f.getWeightKg(),f.getSymptomSummary(),f.getAdherenceAssessment(),f.getNotes()); }
    public SafeFollowUp safeFollowUp(FollowUp f) { return new SafeFollowUp(f.getId(),f.getTreatment().getId(),f.getFollowUpType(),f.getScheduledAt(),f.getCompletedAt(),facility(f.getFacility()),f.getStatus()); }
    private List<AdverseEvent> events(Treatment t) { return em.createQuery("select e from AdverseEvent e where e.treatment.id=:id order by e.reportedAt desc,e.id desc",AdverseEvent.class).setParameter("id",t.getId()).getResultList(); }
    public AdverseView adverse(AdverseEvent e) { return new AdverseView(e.getId(),e.getVersion(),e.getTreatment().getId(),e.getReportedAt(),e.getEventType(),e.getSeverity(),Boolean.TRUE.equals(e.getSerious()),e.getStartedAt(),e.getEndedAt(),e.getDescription(),e.getActionTaken(),e.getOutcome()); }
    private OutcomeView outcomeFor(Treatment t) { var rows=em.createQuery("select o from TreatmentOutcome o where o.treatment.id=:id",TreatmentOutcome.class).setParameter("id",t.getId()).getResultList(); return rows.isEmpty() ? null : outcome(rows.getFirst()); }
    public OutcomeView outcome(TreatmentOutcome o) { String name=em.find(TreatmentOutcomeCode.class,o.getOutcomeCode()).getName(); return new OutcomeView(o.getId(),o.getOutcomeCode(),name,o.getOutcomeDate(),o.getNotes()); }
    private List<LabRequestRef> labs(Treatment t) { return em.createQuery("select r from LabRequest r where r.tbCase.id=:id and r.requestReasonCode='FOLLOW_UP' order by r.requestedAt,r.id",LabRequest.class).setParameter("id",t.getTbCase().getId()).getResultList().stream().map(r -> new LabRequestRef(r.getId(),r.getStatus())).toList(); }
}
