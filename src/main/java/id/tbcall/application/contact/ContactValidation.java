package id.tbcall.application.contact;

import id.tbcall.application.clinical.ClinicalValidation;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.*;
import id.tbcall.security.IdentityNormalizer;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalValidation.text;
import static id.tbcall.application.contact.ContactDtos.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class ContactValidation {
    private final EntityManager em; private final Clock clock; private final ClinicalValidation clinical;
    public ContactValidation(EntityManager em,Clock clock,ClinicalValidation clinical) { this.em=em; this.clock=clock; this.clinical=clinical; }
    public void contact(Contact c) {
        if(text(c.getFullName())==null) throw ApplicationFailure.invalid("Nama kontak wajib diisi.");
        if(c.getBirthDate()!=null && c.getBirthDate().isAfter(today())) throw ApplicationFailure.invalid("Tanggal lahir tidak boleh di masa depan.");
        clinical.reference("SexCode",c.getSexCode(),false); c.setPhone(IdentityNormalizer.phone(c.getPhone()));
    }
    public void merge(Contact c,ContactPatch input) {
        if(input.has("fullName")) c.setFullName(text(input.getFullName())); if(input.has("birthDate")) c.setBirthDate(input.getBirthDate());
        if(input.has("sexCode")) c.setSexCode(text(input.getSexCode())); if(input.has("phone")) c.setPhone(text(input.getPhone()));
        if(input.has("address")) c.setAddress(text(input.getAddress())); if(input.has("relationshipToIndexCase")) c.setRelationshipToIndexCase(text(input.getRelationshipToIndexCase()));
        if(input.has("householdContact")) c.setHouseholdContact(input.getHouseholdContact());
    }
    public Regimen regimen(String raw,TBCase owner) {
        String code=text(raw); if(code==null) return null;
        var found=em.createQuery("select r from Regimen r where r.code=:code and r.active=true and r.regimenKind='PREVENTIVE'",Regimen.class).setParameter("code",code).getResultList();
        if(found.isEmpty() || !Objects.equals(owner.getCaseCategoryCode(),found.getFirst().getTbCaseCategoryCode())) throw ApplicationFailure.invalid("Paduan harus aktif, PREVENTIVE, dan sesuai kategori kasus indeks.");
        return found.getFirst();
    }
    public void tpt(PreventiveTreatment t) {
        if(t.getRegimen()==null && text(t.getRegimenDescription())==null) throw ApplicationFailure.invalid("Isi paduan katalog atau deskripsi paduan individual.");
        if(t.getStartDate()==null || t.getStartDate().isAfter(today()) || (t.getPlannedEndDate()!=null && t.getPlannedEndDate().isBefore(t.getStartDate()))) throw ApplicationFailure.invalid("Tanggal TPT tidak valid.");
        if(t.getDurationValue()!=null && t.getDurationValue()<=0) throw ApplicationFailure.invalid("Durasi harus positif.");
        if(t.getDurationUnit()!=null && !Set.of("DAY","WEEK","MONTH").contains(t.getDurationUnit())) throw ApplicationFailure.invalid("Satuan durasi tidak valid.");
        BigDecimal weight=t.getWeightKg(); if(weight!=null && (weight.signum()<=0 || weight.compareTo(new BigDecimal("10000"))>=0 || weight.stripTrailingZeros().scale()>2)) throw ApplicationFailure.invalid("Berat harus positif, kurang dari 10000, dengan maksimal dua desimal.");
    }
    public void merge(PreventiveTreatment t,TptPatch input) {
        if(input.has("plannedEndDate")) t.setPlannedEndDate(input.getPlannedEndDate()); if(input.has("durationValue")) t.setDurationValue(input.getDurationValue());
        if(input.has("durationUnit")) t.setDurationUnit(text(input.getDurationUnit())); if(input.has("weightKg")) t.setWeightKg(input.getWeightKg());
        if(input.has("drugSource")) t.setDrugSource(text(input.getDrugSource())); if(input.has("regimenDescription")) t.setRegimenDescription(text(input.getRegimenDescription())); if(input.has("notes")) t.setNotes(text(input.getNotes()));
    }
    public void chronology(OffsetDateTime time,OffsetDateTime requested,OffsetDateTime received) {
        if(time.isAfter(now()) || requested==null || time.isBefore(requested) || (received!=null && time.isBefore(received))) throw ApplicationFailure.invalid("Waktu investigasi tidak boleh mendahului tahap sebelumnya atau berada di masa depan.");
    }
    public LocalDate today() { return LocalDate.now(clock); } public OffsetDateTime now() { return OffsetDateTime.now(clock); }
}
