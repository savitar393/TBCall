package id.tbcall.application.contact;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalValidation.text;
import static id.tbcall.application.contact.ContactDtos.*;
import static id.tbcall.application.contact.ContactAccess.Side;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class TptService {
    private final EntityManager em; private final ContactAccess access; private final ContactViews views; private final ContactValidation validation;
    private final ContactSourceAuthorityPolicy source; private final AuditService audit;
    public TptService(EntityManager em,ContactAccess access,ContactViews views,ContactValidation validation,ContactSourceAuthorityPolicy source,AuditService audit) {
        this.em=em; this.access=access; this.views=views; this.validation=validation; this.source=source; this.audit=audit;
    }
    public TptDetail start(CurrentActor actor,UUID investigationId,TptStartInput input) {
        var i=access.investigation(actor,"TPT_WRITE",investigationId,Side.WORKING,true);
        if(!"COMPLETED".equals(i.getStatus()) || !Boolean.TRUE.equals(i.getActiveTbExcluded()) || !Boolean.TRUE.equals(i.getTptEligible()) || i.getContact().getIndexCase()==null) throw ContactErrors.tptState();
        var contact=i.getContact();
        if(em.createQuery("select count(t) from PreventiveTreatment t where t.contact.id=:id and t.status in ('PLANNED','ACTIVE')",Long.class).setParameter("id",contact.getId()).getSingleResult()>0) throw ContactErrors.openTpt();
        Facility facility=access.workingFacility(i); source.requireLocalTptWrite(actor,"TPT_WRITE",facility.getId(),contact.getId(),null);
        PreventiveTreatment t=new PreventiveTreatment(); t.setContact(contact); t.setPatient(null); t.setIndexCase(contact.getIndexCase()); t.setFacility(facility);
        t.setRegimen(validation.regimen(input.regimenCode(),contact.getIndexCase())); t.setRegimenDescription(text(input.regimenDescription())); t.setStartDate(input.startDate()); t.setPlannedEndDate(input.plannedEndDate());
        t.setDurationValue(input.durationValue()); t.setDurationUnit(text(input.durationUnit())); t.setWeightKg(input.weightKg()); t.setDrugSource(text(input.drugSource())); t.setNotes(text(input.notes())); t.setStatus("ACTIVE"); validation.tpt(t);
        em.persist(t); return finish(actor,t,"TPT_STARTED");
    }
    public TptDetail patch(CurrentActor actor,UUID id,TptPatch input,String match) {
        var t=existing(actor,id,match); validation.merge(t,input); validation.tpt(t); return finish(actor,t,"TPT_UPDATED");
    }
    public TptDetail close(CurrentActor actor,UUID id,ClosureInput input,String match,String status) {
        var t=existing(actor,id,match); var date=input.actualEndDate()==null ? validation.today() : input.actualEndDate();
        if(date.isBefore(t.getStartDate()) || date.isAfter(validation.today())) throw ApplicationFailure.invalid("Tanggal penutupan TPT tidak valid.");
        String reason=text(input.closureReason()); if(status.equals("STOPPED") && reason==null) throw ApplicationFailure.invalid("Alasan penghentian TPT wajib diisi.");
        t.setActualEndDate(date); t.setClosureReason(reason); t.setStatus(status);
        String action=switch(status) { case "COMPLETED" -> "TPT_COMPLETED"; case "STOPPED" -> "TPT_STOPPED"; case "LOST_TO_FOLLOW_UP" -> "TPT_LOST_TO_FOLLOW_UP"; default -> throw new IllegalArgumentException("Closure status"); };
        return finish(actor,t,action);
    }
    private PreventiveTreatment existing(CurrentActor actor,UUID id,String match) {
        var t=access.tpt(actor,"TPT_WRITE",id,true); IfMatch.require(match,t.getVersion()); if(!"ACTIVE".equals(t.getStatus())) throw ContactErrors.tptState();
        source.requireLocalTptWrite(actor,"TPT_WRITE",t.getFacility().getId(),t.getContact().getId(),id); return t;
    }
    private TptDetail finish(CurrentActor actor,PreventiveTreatment t,String action) { ContactErrors.flush(em); audit.record(actor.userId(),action,"PREVENTIVE_TREATMENT",t.getId()); return views.tpt(t); }
}
