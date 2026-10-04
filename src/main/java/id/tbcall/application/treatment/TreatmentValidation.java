package id.tbcall.application.treatment;

import id.tbcall.application.clinical.ClinicalErrors;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalValidation.text;
import static id.tbcall.application.treatment.TreatmentDtos.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class TreatmentValidation {
    private final EntityManager em;
    private final Clock clock;
    public TreatmentValidation(EntityManager em,Clock clock) { this.em=em; this.clock=clock; }
    public Regimen regimen(String code,String category) {
        var found=em.createQuery("select r from Regimen r where r.code=:code and r.active=true and r.regimenKind='TB_TREATMENT' and r.tbCaseCategoryCode=:category",Regimen.class)
                .setParameter("code",text(code)).setParameter("category",category).setLockMode(LockModeType.PESSIMISTIC_READ).getResultList();
        if(found.isEmpty()) throw ClinicalErrors.reference(); return found.getFirst();
    }
    public List<TreatmentDrug> drugs(Treatment treatment,List<DrugInput> lines) {
        Set<List<Object>> keys=new HashSet<>(); List<TreatmentDrug> rows=new ArrayList<>();
        for(DrugInput line:lines) {
            var found=em.createQuery("select d from Drug d where d.code=:code and d.active=true",Drug.class).setParameter("code",text(line.drugCode()))
                    .setLockMode(LockModeType.PESSIMISTIC_READ).getResultList();
            if(found.isEmpty()) throw ClinicalErrors.reference();
            Drug drug=found.getFirst(); String phase=text(line.treatmentPhase());
            if(!keys.add(Arrays.asList(drug.getCode(),phase,line.startDate()))) invalid("Baris obat dengan kode, fase dan tanggal yang sama tidak boleh berulang.");
            if(line.startDate().isBefore(treatment.getStartDate())) invalid("Tanggal obat tidak boleh sebelum mulai pengobatan.");
            range(line.startDate(),line.endDate());
            if(line.doseValue()!=null && text(line.doseUnit())==null) invalid("Satuan dosis wajib diisi jika dosis dicatat.");
            TreatmentDrug row=new TreatmentDrug(); row.setTreatment(treatment); row.setDrug(drug); row.setDrugNameSnapshot(drug.getName());
            row.setTreatmentPhase(phase); row.setDoseValue(line.doseValue()); row.setDoseUnit(text(line.doseUnit())); row.setFrequencyPerWeek(line.frequencyPerWeek());
            row.setStartDate(line.startDate()); row.setEndDate(line.endDate()); row.setBatchNumber(text(line.batchNumber())); row.setDrugSource(text(line.drugSource())); row.setNotes(text(line.notes())); rows.add(row);
        }
        return rows;
    }
    public void merge(Treatment t,MetadataInput input) {
        if(input.has("plannedEndDate")) t.setPlannedEndDate(input.getPlannedEndDate());
        if(input.has("initialWeightKg")) t.setInitialWeightKg(input.getInitialWeightKg());
        if(input.has("oatForm")) t.setOatForm(text(input.getOatForm()));
        if(input.has("drugSource")) t.setDrugSource(text(input.getDrugSource()));
        if(input.has("intensiveStartDate")) t.setIntensiveStartDate(input.getIntensiveStartDate());
        if(input.has("intensiveEndDate")) t.setIntensiveEndDate(input.getIntensiveEndDate());
        if(input.has("continuationStartDate")) t.setContinuationStartDate(input.getContinuationStartDate());
        if(input.has("continuationEndDate")) t.setContinuationEndDate(input.getContinuationEndDate());
        if(input.has("regimenDescription")) t.setRegimenDescription(text(input.getRegimenDescription()));
        if(input.has("notes")) t.setNotes(text(input.getNotes()));
    }
    public void plan(Treatment t) {
        range(t.getStartDate(),t.getPlannedEndDate()); range(t.getIntensiveStartDate(),t.getIntensiveEndDate()); range(t.getContinuationStartDate(),t.getContinuationEndDate());
        for(LocalDate date:Arrays.asList(t.getIntensiveStartDate(),t.getIntensiveEndDate(),t.getContinuationStartDate(),t.getContinuationEndDate()))
            if(date!=null && date.isBefore(t.getStartDate())) invalid("Tanggal fase tidak boleh sebelum mulai pengobatan.");
        if(t.getIntensiveEndDate()!=null && t.getContinuationStartDate()!=null && t.getContinuationStartDate().isBefore(t.getIntensiveEndDate())) invalid("Tanggal lanjutan tidak boleh sebelum akhir fase intensif.");
    }
    public void startDate(TBCase owner,LocalDate start) {
        if(start.isAfter(LocalDate.now(clock))) invalid("Tanggal mulai tidak boleh di masa depan.");
        if(owner.getConfirmingDiagnosis()!=null && start.isBefore(owner.getConfirmingDiagnosis().getDiagnosisDate())) invalid("Tanggal mulai tidak boleh sebelum diagnosis konfirmasi.");
    }
    public void adverse(AdverseEvent event) {
        notFuture(event.getStartedAt()); notFuture(event.getEndedAt());
        if(event.getStartedAt()!=null && event.getEndedAt()!=null && event.getEndedAt().isBefore(event.getStartedAt())) invalid("Tanggal akhir kejadian tidak boleh sebelum tanggal mulai.");
    }
    public void merge(AdverseEvent event,AdverseUpdate input) {
        if(input.has("severity")) event.setSeverity(text(input.getSeverity()));
        if(input.has("serious")) { if(input.getSerious()==null) invalid("Nilai serius tidak boleh kosong."); event.setSerious(input.getSerious()); }
        if(input.has("startedAt")) event.setStartedAt(input.getStartedAt());
        if(input.has("endedAt")) event.setEndedAt(input.getEndedAt());
        if(input.has("description")) event.setDescription(text(input.getDescription()));
        if(input.has("actionTaken")) event.setActionTaken(text(input.getActionTaken()));
        if(input.has("outcome")) event.setOutcome(text(input.getOutcome()));
    }
    public void outcome(Treatment treatment,OutcomeInput input) {
        if(em.createQuery("select count(c) from TreatmentOutcomeCode c where c.code=:code and c.active=true",Long.class).setParameter("code",text(input.outcomeCode())).getSingleResult()==0) throw ClinicalErrors.reference();
        if(input.outcomeDate().isBefore(treatment.getStartDate()) || input.outcomeDate().isAfter(LocalDate.now(clock))) invalid("Tanggal hasil akhir harus antara mulai pengobatan dan hari ini.");
    }
    public void notFuture(OffsetDateTime time) { if(time!=null && time.isAfter(OffsetDateTime.now(clock))) invalid("Waktu kejadian tidak boleh di masa depan."); }
    private void range(LocalDate start,LocalDate end) { if(start!=null && end!=null && end.isBefore(start)) invalid("Tanggal akhir tidak boleh sebelum tanggal mulai."); }
    private void invalid(String detail) { throw ApplicationFailure.invalid(detail); }
}
