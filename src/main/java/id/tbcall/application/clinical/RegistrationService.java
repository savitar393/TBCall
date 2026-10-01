package id.tbcall.application.clinical;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class RegistrationService {
    private final EntityManager em;
    private final ClinicalAccess access;
    private final ClinicalValidation validation;
    private final PatientIdentityService identities;
    private final ClinicalSourceAuthorityPolicy source;
    private final ClinicalViews views;
    private final AuditService audit;
    public RegistrationService(EntityManager em,ClinicalAccess access,ClinicalValidation validation,PatientIdentityService identities,
            ClinicalSourceAuthorityPolicy source,ClinicalViews views,AuditService audit) {
        this.em=em; this.access=access; this.validation=validation; this.identities=identities; this.source=source; this.views=views; this.audit=audit;
    }
    public RegistrationView create(CurrentActor actor,RegistrationCreate input) {
        access.officer(actor,"PATIENT_CREATE"); Facility facility=access.selectedFacility(actor,"REGISTRATION_WRITE",input.getFacilityId());
        if((input.getNewPatient()==null)==(input.getExistingPatient()==null)) throw ApplicationFailure.invalid("Pilih tepat satu pasien baru atau pasien yang sudah terdaftar.");
        source.requireLocalCreate(actor,"REGISTRATION_WRITE",facility.getId(),"TB_REGISTRATION");
        Patient patient;
        if(input.getNewPatient()!=null) {
            source.requireLocalCreate(actor,"PATIENT_CREATE",facility.getId(),"PATIENT");
            patient=new Patient(); validation.mergePatient(patient,input.getNewPatient()); validation.patient(patient);
        } else patient=identities.existing(actor,input.getExistingPatient());
        TBRegistration registration=new TBRegistration(); registration.setPatient(patient); registration.setFacility(facility);
        validation.mergeRegistration(registration,input); validation.registration(registration); registration.setStatus("OPEN");
        if(input.getNewPatient()!=null) em.persist(patient);
        em.persist(registration);
        // AuditLog uses an IDENTITY key and may flush pending inserts. Map identity races before recording it.
        ClinicalErrors.flush(em);
        if(input.getNewPatient()!=null) audit.record(actor.userId(),"PATIENT_CREATED","PATIENT",patient.getId());
        audit.record(actor.userId(),"TB_REGISTRATION_CREATED","TB_REGISTRATION",registration.getId()); return views.registration(registration);
    }
    public RegistrationView update(CurrentActor actor,UUID id,RegistrationInput input,String match) {
        TBRegistration registration=access.registration(actor,"REGISTRATION_WRITE",id,false); IfMatch.require(match,registration.getVersion());
        if(!"OPEN".equals(registration.getStatus())) throw ClinicalErrors.state();
        source.requireLocalEdit(actor,"REGISTRATION_WRITE",registration.getFacility().getId(),"TB_REGISTRATION",id);
        validation.mergeRegistration(registration,input); validation.registration(registration);
        ClinicalErrors.flush(em); audit.record(actor.userId(),"TB_REGISTRATION_UPDATED","TB_REGISTRATION",id); return views.registration(registration);
    }
}
