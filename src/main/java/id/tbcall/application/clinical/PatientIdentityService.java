package id.tbcall.application.clinical;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.Patient;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class PatientIdentityService {
    private final EntityManager em;
    private final ClinicalAccess access;
    private final ClinicalViews views;
    private final AuditService audit;
    public PatientIdentityService(EntityManager em,ClinicalAccess access,ClinicalViews views,AuditService audit) {
        this.em=em; this.access=access; this.views=views; this.audit=audit;
    }
    public IdentityConfirmation resolve(CurrentActor actor,IdentityInput input) {
        access.officer(actor,"PATIENT_IDENTITY_RESOLVE"); Patient patient=match(input);
        audit.record(actor.userId(),"PATIENT_IDENTITY_RESOLVED","PATIENT",patient.getId());
        return views.identity(patient);
    }
    public Patient existing(CurrentActor actor,ExistingPatient input) {
        // Resolve all supplied confirmation, including ambiguity, independently of the caller's UUID.
        ConfirmedInput confirmation=input.hasConfirmation() ? validate(input.confirmation()) : null;
        if(confirmation!=null && !match(confirmation).getId().equals(input.patientId())) throw ApplicationFailure.missing();
        Patient patient=em.find(Patient.class,input.patientId(),LockModeType.PESSIMISTIC_READ);
        if(patient==null) throw ApplicationFailure.missing();
        if(confirmation==null) {
            if(!access.currentPatient(actor,patient.getId())) throw ApplicationFailure.missing();
        } else {
            // Resolution may have loaded this entity before waiting for its lock. Recheck fresh demographics.
            em.refresh(patient,LockModeType.PESSIMISTIC_READ);
            if(!confirms(patient,confirmation)) throw ApplicationFailure.missing();
        }
        return patient;
    }
    private Patient match(IdentityInput input) {
        return match(validate(input));
    }
    private record ConfirmedInput(String citizenship,String key,String name,java.time.LocalDate birthDate,String bpjs) {}
    private ConfirmedInput validate(IdentityInput input) {
        String citizenship=ClinicalValidation.text(input.citizenship());
        String name=ClinicalValidation.normalizedName(input.fullName()),bpjs=ClinicalValidation.text(input.bpjsNumber());
        if(!Set.of("WNI","WNA").contains(Objects.toString(citizenship,"")) || (name==null && input.birthDate()==null))
            throw ApplicationFailure.invalid("Isi identitas WNI/WNA dan konfirmasi nama atau tanggal lahir.");
        String key="WNI".equals(citizenship) ? ClinicalValidation.text(input.nik()) : ClinicalValidation.text(input.otherIdentityNumber());
        if(key==null || ("WNI".equals(citizenship) && !key.matches("[0-9]{16}")))
            throw ApplicationFailure.invalid("Identitas utama pasien tidak valid.");
        return new ConfirmedInput(citizenship,key,name,input.birthDate(),bpjs);
    }
    private Patient match(ConfirmedInput input) {
        String citizenship=input.citizenship();
        String field="WNI".equals(citizenship) ? "nik" : "otherIdentityNumber";
        var found=em.createQuery("select p from Patient p where p.citizenship=:citizenship and p."+field+"=:key",Patient.class)
                .setParameter("citizenship",citizenship).setParameter("key",input.key()).getResultList().stream()
                .filter(p -> confirms(p,input)).toList();
        if(found.isEmpty()) throw ApplicationFailure.missing(); if(found.size()>1) throw ClinicalErrors.ambiguousIdentity();
        return found.getFirst();
    }
    private boolean confirms(Patient patient,ConfirmedInput input) {
        String key="WNI".equals(input.citizenship()) ? patient.getNik() : patient.getOtherIdentityNumber();
        return input.citizenship().equals(patient.getCitizenship()) && input.key().equals(key)
                && (input.name()==null || input.name().equals(ClinicalValidation.normalizedName(patient.getFullName())))
                && (input.birthDate()==null || input.birthDate().equals(patient.getBirthDate()))
                && (input.bpjs()==null || input.bpjs().equals(patient.getBpjsNumber()));
    }
}
