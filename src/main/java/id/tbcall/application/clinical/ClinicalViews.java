package id.tbcall.application.clinical;

import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

/** Explicit projections. Catalogs are loaded once for a batch, never once per patient. */
@Component
@Transactional(propagation=Propagation.MANDATORY)
public class ClinicalViews {
    private final EntityManager em;
    public ClinicalViews(EntityManager em) { this.em=em; }
    public record Labels(Map<String,String> sex,Map<String,String> anatomy,Map<String,String> diagnosis,Map<String,String> category) {}
    public Labels labels() { return new Labels(catalog("SexCode"),catalog("AnatomicalSite"),catalog("DiagnosisType"),catalog("TBCaseCategory")); }
    private Map<String,String> catalog(String entity) {
        Map<String,String> names=new HashMap<>();
        em.createQuery("select r.code,r.name from "+entity+" r",Object[].class).getResultList().forEach(row -> names.put((String)row[0],(String)row[1]));
        return names;
    }
    public static String mask(String identity) {
        if(identity==null) return null;
        int visible=identity.length()>4 ? 4 : 0;
        return "*".repeat(identity.length()-visible)+identity.substring(identity.length()-visible);
    }
    private Label label(Map<String,String> names,String code) { return code==null ? null : new Label(code,names.get(code)); }
    public FacilityDisplay facility(Facility f) { return f==null ? null : new FacilityDisplay(f.getId(),f.getName()); }
    public PatientSummary patient(Patient p,Labels labels) { return new PatientSummary(p.getId(),p.getVersion(),p.getFullName(),label(labels.sex(),p.getSexCode()),p.getBirthDate(),Boolean.TRUE.equals(p.getBirthDateUnknown())); }
    public Demographics demographics(Patient p,Labels labels) {
        return new Demographics(p.getFullName(),p.getCitizenship(),p.getNik(),p.getOtherIdentityNumber(),p.getBpjsNumber(),p.getBirthPlace(),p.getBirthDate(),Boolean.TRUE.equals(p.getBirthDateUnknown()),
                label(labels.sex(),p.getSexCode()),p.getPhone(),p.getAddress(),p.getProvinceCode(),p.getRegencyCode(),p.getDistrictCode(),p.getVillageCode());
    }
    public IdentityConfirmation identity(Patient p) {
        Labels labels=labels(); return new IdentityConfirmation(p.getId(),p.getFullName(),p.getCitizenship(),mask(p.getNik()),mask(p.getOtherIdentityNumber()),mask(p.getBpjsNumber()),
                p.getBirthDate(),Boolean.TRUE.equals(p.getBirthDateUnknown()),label(labels.sex(),p.getSexCode()));
    }
    public RegistrationSummary registrationSummary(TBRegistration r) { return new RegistrationSummary(r.getId(),r.getVersion(),r.getStatus(),r.getRegistrationDate(),facility(r.getFacility())); }
    public RegistrationView registration(TBRegistration r) { return registration(r,labels()); }
    public RegistrationView registration(TBRegistration r,Labels labels) {
        return new RegistrationView(r.getId(),r.getVersion(),r.getStatus(),patient(r.getPatient(),labels),facility(r.getFacility()),r.getRegistrationDate(),r.getFacilityRegistrationNumber(),r.getMedicalRecordNumber(),
                r.getSpecimenIdentityNumber(),r.getSuspectTypeCode(),r.getPreviousTreatmentCategoryCode(),r.getReferredByType(),r.getReferredByReference(),r.getReferralNotes(),r.getInitialWeightKg(),r.getHivStatusCode(),r.getDmStatusCode());
    }
    public DiagnosisSummary diagnosisSummary(Diagnosis d,Labels labels) {
        return d==null ? null : new DiagnosisSummary(d.getId(),d.getVersion(),d.getDiagnosisDate(),label(labels.anatomy(),d.getAnatomicalSiteCode()),label(labels.diagnosis(),d.getDiagnosisTypeCode()));
    }
    public DiagnosisView diagnosis(Diagnosis d) {
        return diagnosis(d,labels());
    }
    public DiagnosisView diagnosis(Diagnosis d,Labels labels) {
        return new DiagnosisView(d.getId(),d.getVersion(),d.getRegistration().getId(),d.getRegistration().getVersion(),d.getDiagnosisDate(),label(labels.anatomy(),d.getAnatomicalSiteCode()),
                label(labels.diagnosis(),d.getDiagnosisTypeCode()),d.getDiagnosisResult(),d.getChestXrayResult(),d.getChestXrayDate(),d.getChestXraySerial(),d.getChestXrayImpression(),d.getIcd10Code(),d.getTreatmentDisposition(),facility(d.getReferredToFacility()),d.getNotes());
    }
    public CaseSummary caseSummary(TBCase c,Labels labels) {
        return new CaseSummary(c.getId(),c.getVersion(),c.getStatus(),label(labels.category(),c.getCaseCategoryCode()),facility(c.getCurrentFacility()),diagnosisSummary(c.getConfirmingDiagnosis(),labels));
    }
    public CaseListSummary caseListSummary(TBCase c,Labels labels) {
        return new CaseListSummary(c.getId(),c.getVersion(),c.getStatus(),label(labels.category(),c.getCaseCategoryCode()),facility(c.getCurrentFacility()));
    }
    public CaseView tbCase(TBCase c) {
        Labels labels=labels(); return new CaseView(c.getId(),c.getVersion(),c.getStatus(),facility(c.getCurrentFacility()),patient(c.getRegistration().getPatient(),labels),registrationSummary(c.getRegistration()),diagnosisSummary(c.getConfirmingDiagnosis(),labels),
                c.getCaseCategoryCode(),c.getDrugResistancePatternCode(),c.getHealthWorker(),c.getPregnancyStatusCode(),c.getHeightCm(),c.getWeightKg(),c.getBcgStatusCode(),c.getPreviousTreatmentCategoryCode(),c.getHivStatusCode(),c.getDmStatusCode(),c.getIcd10Code(),c.getConfirmedAt());
    }
}
