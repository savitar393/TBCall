package id.tbcall.application.clinical;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.*;
import id.tbcall.security.IdentityNormalizer;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class ClinicalValidation {
    private final EntityManager em;
    private final Clock clock;
    public ClinicalValidation(EntityManager em,Clock clock) { this.em=em; this.clock=clock; }
    public static String text(String value) { return value==null || value.isBlank() ? null : value.strip(); }
    public static String normalizedName(String value) { String clean=text(value); return clean==null ? null : clean.replaceAll("\\s+"," ").toLowerCase(Locale.ROOT); }
    public void reference(String entity,String code,boolean required) {
        if(code==null) { if(required) throw ClinicalErrors.reference(); return; }
        // Entity names are fixed internal call-site constants, never request-controlled.
        if(em.createQuery("select count(r) from "+entity+" r where r.code=:code and r.active=true",Long.class)
                .setParameter("code",code).getSingleResult()==0) throw ClinicalErrors.reference();
    }
    public void patient(Patient p) {
        if(p.getFullName()==null || !Set.of("WNI","WNA").contains(Objects.toString(p.getCitizenship(),"")))
            throw ApplicationFailure.invalid("Nama dan kewarganegaraan WNI/WNA wajib diisi.");
        if("WNI".equals(p.getCitizenship()) && (p.getNik()==null || !p.getNik().matches("[0-9]{16}")))
            throw ApplicationFailure.invalid("NIK WNI harus terdiri dari 16 digit.");
        if(p.getNik()!=null && !p.getNik().matches("[0-9]{16}")) throw ApplicationFailure.invalid("NIK harus terdiri dari 16 digit.");
        if("WNA".equals(p.getCitizenship()) && p.getOtherIdentityNumber()==null)
            throw ApplicationFailure.invalid("Nomor identitas WNA wajib diisi.");
        boolean unknown=Boolean.TRUE.equals(p.getBirthDateUnknown()); p.setBirthDateUnknown(unknown);
        if((!unknown && p.getBirthDate()==null) || (unknown && p.getBirthDate()!=null))
            throw ApplicationFailure.invalid("Isi tanggal lahir atau tandai tanggal lahir tidak diketahui.");
        notFuture(p.getBirthDate()); reference("SexCode",p.getSexCode(),true); p.setPhone(IdentityNormalizer.phone(p.getPhone()));
        long duplicates=em.createQuery("select count(p) from Patient p where (p.nik=:nik or p.bpjsNumber=:bpjs) and (:id is null or p.id<>:id)",Long.class)
                // Check before a dirty demographic PATCH is flushed into the unique constraints.
                .setFlushMode(jakarta.persistence.FlushModeType.COMMIT)
                .setParameter("nik",p.getNik()).setParameter("bpjs",p.getBpjsNumber()).setParameter("id",p.getId()).getSingleResult();
        if(duplicates>0) throw ClinicalErrors.duplicateIdentity();
    }
    public void registration(TBRegistration r) {
        if(r.getRegistrationDate()==null) throw ApplicationFailure.invalid("Tanggal registrasi wajib diisi.");
        notFuture(r.getRegistrationDate()); reference("TBSuspectType",r.getSuspectTypeCode(),true);
        reference("PreviousTreatmentCategory",r.getPreviousTreatmentCategoryCode(),true);
        reference("HivStatus",r.getHivStatusCode(),false); reference("DmStatus",r.getDmStatusCode(),false);
        positive(r.getInitialWeightKg());
    }
    public void diagnosis(Diagnosis d) {
        if(d.getDiagnosisDate()==null || d.getDiagnosisDate().isBefore(d.getRegistration().getRegistrationDate()))
            throw ApplicationFailure.invalid("Tanggal diagnosis tidak boleh mendahului registrasi.");
        notFuture(d.getDiagnosisDate()); notFuture(d.getChestXrayDate());
        reference("AnatomicalSite",d.getAnatomicalSiteCode(),true); reference("DiagnosisType",d.getDiagnosisTypeCode(),true);
        if(d.getDiagnosisResult()==null || !Set.of("TREAT_HERE","REFERRED","NOT_TREATED","UNKNOWN").contains(Objects.toString(d.getTreatmentDisposition(),"")))
            throw ApplicationFailure.invalid("Hasil diagnosis dan disposisi pengobatan wajib diisi.");
        if("REFERRED".equals(d.getTreatmentDisposition()) && d.getReferredToFacility()==null)
            throw ApplicationFailure.invalid("Fasyankes tujuan rujukan wajib diisi.");
        if(d.getReferredToFacility()!=null && (!Boolean.TRUE.equals(d.getReferredToFacility().getActive())
                || d.getRegistration().getFacility().getId().equals(d.getReferredToFacility().getId())))
            throw ApplicationFailure.invalid("Tujuan rujukan harus aktif dan berbeda dari fasyankes registrasi.");
    }
    public void tbCase(TBCase c) {
        reference("TBCaseCategory",c.getCaseCategoryCode(),true); reference("DrugResistancePattern",c.getDrugResistancePatternCode(),false);
        reference("PreviousTreatmentCategory",c.getPreviousTreatmentCategoryCode(),true);
        reference("PregnancyStatus",c.getPregnancyStatusCode(),false); reference("BcgStatus",c.getBcgStatusCode(),false);
        reference("HivStatus",c.getHivStatusCode(),false); reference("DmStatus",c.getDmStatusCode(),false);
        positive(c.getHeightCm()); positive(c.getWeightKg());
        String resistance=c.getDrugResistancePatternCode();
        if(resistance!=null && (("TB_SO".equals(c.getCaseCategoryCode()) && !"TB_SO".equals(resistance))
                || ("TB_RO".equals(c.getCaseCategoryCode()) && !Set.of("TB_HR","TB_RR","TB_MDR","TB_PRE_XDR","TB_XDR").contains(resistance))))
            throw ApplicationFailure.invalid("Kategori kasus dan pola resistansi obat tidak sesuai.");
    }
    private void notFuture(LocalDate date) {
        if(date!=null && date.isAfter(LocalDate.now(clock))) throw ApplicationFailure.invalid("Tanggal tidak boleh di masa depan.");
    }
    private void positive(BigDecimal value) {
        if(value!=null && (value.signum()<=0 || value.compareTo(new BigDecimal("10000"))>=0 || value.stripTrailingZeros().scale()>2))
            throw ApplicationFailure.invalid("Ukuran harus positif, kurang dari 10000, dengan maksimal dua desimal.");
    }
    public void mergePatient(Patient target,PatientInput input) {
        if(input.has("fullName")) target.setFullName(text(input.getFullName()));
        if(input.has("citizenship")) target.setCitizenship(text(input.getCitizenship()));
        if(input.has("nik")) target.setNik(text(input.getNik()));
        if(input.has("otherIdentityNumber")) target.setOtherIdentityNumber(text(input.getOtherIdentityNumber()));
        if(input.has("bpjsNumber")) target.setBpjsNumber(text(input.getBpjsNumber()));
        if(input.has("birthPlace")) target.setBirthPlace(text(input.getBirthPlace()));
        if(input.has("birthDate")) target.setBirthDate(input.getBirthDate());
        if(input.has("birthDateUnknown")) target.setBirthDateUnknown(input.getBirthDateUnknown());
        if(input.has("sexCode")) target.setSexCode(text(input.getSexCode()));
        if(input.has("phone")) target.setPhone(text(input.getPhone()));
        if(input.has("address")) target.setAddress(text(input.getAddress()));
        if(input.has("provinceCode")) target.setProvinceCode(text(input.getProvinceCode()));
        if(input.has("regencyCode")) target.setRegencyCode(text(input.getRegencyCode()));
        if(input.has("districtCode")) target.setDistrictCode(text(input.getDistrictCode()));
        if(input.has("villageCode")) target.setVillageCode(text(input.getVillageCode()));
    }

    public void mergeRegistration(TBRegistration target,RegistrationInput input) {
        if(input.has("registrationDate")) target.setRegistrationDate(input.getRegistrationDate());
        if(input.has("facilityRegistrationNumber")) target.setFacilityRegistrationNumber(text(input.getFacilityRegistrationNumber()));
        if(input.has("medicalRecordNumber")) target.setMedicalRecordNumber(text(input.getMedicalRecordNumber()));
        if(input.has("specimenIdentityNumber")) target.setSpecimenIdentityNumber(text(input.getSpecimenIdentityNumber()));
        if(input.has("suspectTypeCode")) target.setSuspectTypeCode(text(input.getSuspectTypeCode()));
        if(input.has("previousTreatmentCategoryCode")) target.setPreviousTreatmentCategoryCode(text(input.getPreviousTreatmentCategoryCode()));
        if(input.has("referredByType")) target.setReferredByType(text(input.getReferredByType()));
        if(input.has("referredByReference")) target.setReferredByReference(text(input.getReferredByReference()));
        if(input.has("referralNotes")) target.setReferralNotes(text(input.getReferralNotes()));
        if(input.has("initialWeightKg")) target.setInitialWeightKg(input.getInitialWeightKg());
        if(input.has("hivStatusCode")) target.setHivStatusCode(text(input.getHivStatusCode()));
        if(input.has("dmStatusCode")) target.setDmStatusCode(text(input.getDmStatusCode()));
    }

    public void mergeCase(TBCase target,CaseInput input) {
        if(input.has("caseCategoryCode")) target.setCaseCategoryCode(text(input.getCaseCategoryCode()));
        if(input.has("drugResistancePatternCode")) target.setDrugResistancePatternCode(text(input.getDrugResistancePatternCode()));
        if(input.has("healthWorker")) target.setHealthWorker(input.getHealthWorker());
        if(input.has("pregnancyStatusCode")) target.setPregnancyStatusCode(text(input.getPregnancyStatusCode()));
        if(input.has("heightCm")) target.setHeightCm(input.getHeightCm());
        if(input.has("weightKg")) target.setWeightKg(input.getWeightKg());
        if(input.has("bcgStatusCode")) target.setBcgStatusCode(text(input.getBcgStatusCode()));
        if(input.has("previousTreatmentCategoryCode")) target.setPreviousTreatmentCategoryCode(text(input.getPreviousTreatmentCategoryCode()));
        if(input.has("hivStatusCode")) target.setHivStatusCode(text(input.getHivStatusCode()));
        if(input.has("dmStatusCode")) target.setDmStatusCode(text(input.getDmStatusCode()));
        if(input.has("icd10Code")) target.setIcd10Code(text(input.getIcd10Code()));
    }

    public void mergeDiagnosis(Diagnosis target,DiagnosisInput input) {
        if(input.has("diagnosisDate")) target.setDiagnosisDate(input.getDiagnosisDate());
        if(input.has("anatomicalSiteCode")) target.setAnatomicalSiteCode(text(input.getAnatomicalSiteCode()));
        if(input.has("diagnosisTypeCode")) target.setDiagnosisTypeCode(text(input.getDiagnosisTypeCode()));
        if(input.has("diagnosisResult")) target.setDiagnosisResult(text(input.getDiagnosisResult()));
        if(input.has("chestXrayResult")) target.setChestXrayResult(text(input.getChestXrayResult()));
        if(input.has("chestXrayDate")) target.setChestXrayDate(input.getChestXrayDate());
        if(input.has("chestXraySerial")) target.setChestXraySerial(text(input.getChestXraySerial()));
        if(input.has("chestXrayImpression")) target.setChestXrayImpression(text(input.getChestXrayImpression()));
        if(input.has("icd10Code")) target.setIcd10Code(text(input.getIcd10Code()));
        if(input.has("treatmentDisposition")) target.setTreatmentDisposition(text(input.getTreatmentDisposition()));
        if(input.has("notes")) target.setNotes(text(input.getNotes()));
        if(input.has("referredToFacilityId")) {
            Facility destination=input.getReferredToFacilityId()==null ? null : em.find(Facility.class,input.getReferredToFacilityId(),jakarta.persistence.LockModeType.PESSIMISTIC_READ);
            if(input.getReferredToFacilityId()!=null && destination==null) throw ApplicationFailure.invalid("Tujuan rujukan tidak tersedia.");
            target.setReferredToFacility(destination);
        }
    }
}
