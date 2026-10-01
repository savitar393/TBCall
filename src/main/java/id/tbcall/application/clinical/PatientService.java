package id.tbcall.application.clinical;

import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class PatientService {
    private final EntityManager em;
    private final ClinicalAccess access;
    private final ClinicalValidation validation;
    private final ClinicalSourceAuthorityPolicy source;
    private final ClinicalQueryService queries;
    private final AuditService audit;
    public PatientService(EntityManager em,ClinicalAccess access,ClinicalValidation validation,ClinicalSourceAuthorityPolicy source,
            ClinicalQueryService queries,AuditService audit) {
        this.em=em; this.access=access; this.validation=validation; this.source=source; this.queries=queries; this.audit=audit;
    }
    public PatientDetail update(CurrentActor actor,UUID id,PatientInput input,String match) {
        var patient=access.patient(actor,"PATIENT_UPDATE",id); IfMatch.require(match,patient.getVersion());
        source.requireLocalEdit(actor,"PATIENT_UPDATE",access.patientFacility(actor,id),"PATIENT",id);
        validation.mergePatient(patient,input); validation.patient(patient);
        ClinicalErrors.flush(em); audit.record(actor.userId(),"PATIENT_UPDATED","PATIENT",id); return queries.detail(actor,patient);
    }
}
