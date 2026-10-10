package id.tbcall.application.clinical;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.laboratory.LabAccess;
import id.tbcall.application.treatment.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.CaseSummaryDtos.*;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class CaseSummaryService {
    private static final int PAGE_SIZE=5;
    private final EntityManager em;
    private final ClinicalAccess clinical;
    private final ClinicalViews clinicalViews;
    private final LabAccess laboratory;
    private final TreatmentAccess treatment;
    private final TreatmentViews treatmentViews;
    public CaseSummaryService(EntityManager em,ClinicalAccess clinical,ClinicalViews clinicalViews,
            LabAccess laboratory,TreatmentAccess treatment,TreatmentViews treatmentViews) {
        this.em=em; this.clinical=clinical; this.clinicalViews=clinicalViews;
        this.laboratory=laboratory; this.treatment=treatment; this.treatmentViews=treatmentViews;
    }
    public Summary read(CurrentActor actor,UUID id,int diagnosisPage,int labPage,int treatmentPage) {
        // Authorize the case before looking at any clinical child or its existence.
        TBCase c=clinical.tbCase(actor,"CASE_READ",id);
        for(int page:new int[]{diagnosisPage,labPage,treatmentPage}) {
            if(page<0 || (long)page*PAGE_SIZE>Integer.MAX_VALUE) throw ApplicationFailure.invalid("Halaman ringkasan tidak valid.");
        }
        TBRegistration r=c.getRegistration();
        boolean registrationScope=actor.facilityIds().contains(r.getFacility().getId()) && Boolean.TRUE.equals(r.getFacility().getActive());
        Section<ClinicalDtos.RegistrationSummary> registration=!allowed(actor,"REGISTRATION_READ") ? Section.denied()
                : !registrationScope ? Section.outside() : Section.available(clinicalViews.registrationSummary(r));
        return new Summary(c.getId(),r.getPatient().getFullName(),c.getStatus(),clinicalViews.facility(c.getCurrentFacility()),
                c.getCaseCategoryCode(),c.getConfirmedAt(),registration,
                diagnoses(actor,c,registrationScope,diagnosisPage),labs(actor,c,labPage),treatments(actor,c,treatmentPage));
    }
    private boolean allowed(CurrentActor actor,String permission) { return actor.permissions().contains(permission); }
    private Section<Page<DiagnosisItem>> diagnoses(CurrentActor actor,TBCase c,boolean scope,int page) {
        if(!allowed(actor,"DIAGNOSIS_READ")) return Section.denied();
        if(!scope) return Section.outside();
        // The original diagnosis policy follows its registration facility, not the transferred case facility.
        clinical.registration(actor,"DIAGNOSIS_READ",c.getRegistration().getId(),false);
        UUID reg=c.getRegistration().getId();
        long count=em.createQuery("select count(d) from Diagnosis d where d.registration.id=:id",Long.class).setParameter("id",reg).getSingleResult();
        var rows=em.createQuery("select d from Diagnosis d where d.registration.id=:id order by d.diagnosisDate desc,d.id",Diagnosis.class)
                .setParameter("id",reg).setFirstResult(page*PAGE_SIZE).setMaxResults(PAGE_SIZE).getResultList();
        UUID confirming=c.getConfirmingDiagnosis()==null ? null : c.getConfirmingDiagnosis().getId();
        return Section.available(new Page<>(rows.stream().map(d -> new DiagnosisItem(d.getId(),d.getDiagnosisDate(),d.getAnatomicalSiteCode(),
                d.getDiagnosisTypeCode(),d.getDiagnosisResult(),d.getTreatmentDisposition(),d.getId().equals(confirming))).toList(),page,PAGE_SIZE,count));
    }
    private Section<Page<LabItem>> labs(CurrentActor actor,TBCase c,int page) {
        // The whole result-bearing section is denied if either existing parent/child permission is absent.
        if(!allowed(actor,"LAB_REQUEST_READ") || !allowed(actor,"LAB_RESULT_READ")) return Section.denied();
        laboratory.require(actor,LabAccess.Mode.READ);
        String where=" where (r.tbCase.id=:case or r.registration.id=:registration) and "+laboratory.predicate(LabAccess.Mode.READ);
        var count=laboratory.scope(em.createQuery("select count(r) from LabRequest r"+where,Long.class),actor,LabAccess.Mode.READ);
        var query=laboratory.scope(em.createQuery("select r from LabRequest r"+where+" order by r.requestedAt desc nulls last,r.id",LabRequest.class),actor,LabAccess.Mode.READ);
        for(var q:List.of(count,query)) q.setParameter("case",c.getId()).setParameter("registration",c.getRegistration().getId());
        var rows=query.setFirstResult(page*PAGE_SIZE).setMaxResults(PAGE_SIZE).getResultList();
        return Section.available(new Page<>(rows.stream().map(r -> new LabItem(r.getId(),r.getTbCase()==null ? "REGISTRATION" : "CASE",
                r.getStatus(),r.getRequestReasonCode(),r.getRequestedAt(),clinicalViews.facility(r.getRequestingFacility()),
                clinicalViews.facility(r.getTestingFacility()),results(r))).toList(),page,PAGE_SIZE,count.getSingleResult()));
    }
    private Slice<ResultItem> results(LabRequest r) {
        // Original and corrected reported versions share the existing test/specimen lineage.
        // No diagnosis-to-result relationship or clinical interpretation is introduced.
        var rows=em.createQuery("""
                select v,(select max(n.sequenceNo) from LabResult n where n.labRequestTest=v.labRequestTest
                    and ((n.specimen is null and v.specimen is null) or n.specimen=v.specimen))
                from LabResult v where v.labRequestTest.labRequest.id=:id and v.status in ('FINAL','CORRECTED')
                order by v.labRequestTest.id,v.specimen.id nulls first,v.sequenceNo desc,v.id
                """,Object[].class).setParameter("id",r.getId()).setMaxResults(21).getResultList();
        return slice(rows,20,row -> {
            LabResult v=(LabResult)row[0];
            return new ResultItem(v.getId(),v.getLabRequestTest().getId(),v.getSpecimen()==null ? null : v.getSpecimen().getId(),
                    v.getLabRequestTest().getTestTypeCode(),v.getSequenceNo(),v.getStatus(),v.getTestedAt(),v.getResultCode(),v.getResultValue(),v.getResultText(),v.getSequenceNo().equals(row[1]));
        });
    }
    private Section<Page<TreatmentItem>> treatments(CurrentActor actor,TBCase c,int page) {
        if(!allowed(actor,"TREATMENT_READ")) return Section.denied();
        treatment.staffCase(actor,"TREATMENT_READ",c.getId(),false);
        String where=" where t.tbCase.id=:id and t.facility.id in :facilities and t.facility.active=true";
        var count=em.createQuery("select count(t) from Treatment t"+where,Long.class).setParameter("id",c.getId()).setParameter("facilities",actor.facilityIds());
        var rows=em.createQuery("select t from Treatment t"+where+" order by t.startDate desc,t.createdAt desc,t.id desc",Treatment.class)
                .setParameter("id",c.getId()).setParameter("facilities",actor.facilityIds()).setFirstResult(page*PAGE_SIZE).setMaxResults(PAGE_SIZE).getResultList();
        return Section.available(new Page<>(rows.stream().map(t -> episode(actor,t)).toList(),page,PAGE_SIZE,count.getSingleResult()));
    }
    private TreatmentItem episode(CurrentActor actor,Treatment t) {
        var drugs=em.createQuery("select d from TreatmentDrug d where d.treatment.id=:id order by d.startDate,d.id",TreatmentDrug.class)
                .setParameter("id",t.getId()).setMaxResults(21).getResultList();
        return new TreatmentItem(t.getId(),t.getStatus(),clinicalViews.facility(t.getFacility()),t.getRegimen()==null ? null : t.getRegimen().getName(),
                t.getStartDate(),t.getPlannedEndDate(),t.getActualEndDate(),slice(drugs,20,d -> new DrugItem(d.getDrugNameSnapshot(),d.getTreatmentPhase(),d.getDoseValue(),
                        d.getDoseUnit(),d.getFrequencyPerWeek(),d.getStartDate(),d.getEndDate())),
                doses(actor,t),follows(actor,t),outcome(actor,t));
    }
    private Section<Slice<TreatmentDtos.SafeDose>> doses(CurrentActor actor,Treatment t) {
        if(!allowed(actor,"ADHERENCE_READ")) return Section.denied();
        var rows=em.createQuery("select d from DoseEvent d where d.treatment.id=:id order by d.scheduledDate desc,d.recordedAt desc,d.id desc",DoseEvent.class)
                .setParameter("id",t.getId()).setMaxResults(11).getResultList();
        return Section.available(slice(rows,10,treatmentViews::safeDose));
    }
    private Section<Slice<FollowItem>> follows(CurrentActor actor,Treatment t) {
        if(!allowed(actor,"FOLLOW_UP_READ")) return Section.denied();
        var rows=em.createQuery("select f from FollowUp f where f.treatment.id=:id order by f.scheduledAt desc,f.id",FollowUp.class)
                .setParameter("id",t.getId()).setMaxResults(11).getResultList();
        return Section.available(slice(rows,10,f -> new FollowItem(f.getId(),f.getFollowUpType(),f.getStatus(),f.getScheduledAt(),f.getCompletedAt(),
                clinicalViews.facility(f.getFacility()),f.getWeightKg(),f.getSymptomSummary(),f.getAdherenceAssessment())));
    }
    private Section<OutcomeItem> outcome(CurrentActor actor,Treatment t) {
        if(!allowed(actor,"OUTCOME_READ")) return Section.denied();
        var rows=em.createQuery("select o from TreatmentOutcome o where o.treatment.id=:id",TreatmentOutcome.class).setParameter("id",t.getId()).setMaxResults(1).getResultList();
        if(rows.isEmpty()) return Section.available(null);
        var v=treatmentViews.outcome(rows.getFirst());
        return Section.available(new OutcomeItem(v.outcomeCode(),v.outcomeName(),v.outcomeDate()));
    }
    private <T,R> Slice<R> slice(List<T> rows,int limit,java.util.function.Function<T,R> mapper) {
        return new Slice<>(rows.stream().limit(limit).map(mapper).toList(),rows.size()>limit);
    }
}
