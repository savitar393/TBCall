package id.tbcall.application.contact;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.ContactInvestigation;
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
public class InvestigationService {
    private final EntityManager em; private final ContactAccess access; private final ContactViews views; private final ContactValidation validation;
    private final ContactSourceAuthorityPolicy source; private final AuditService audit;
    public InvestigationService(EntityManager em,ContactAccess access,ContactViews views,ContactValidation validation,ContactSourceAuthorityPolicy source,AuditService audit) {
        this.em=em; this.access=access; this.views=views; this.validation=validation; this.source=source; this.audit=audit;
    }
    public InvestigationDetail receive(CurrentActor actor,UUID id,ReceiveInput input,String match) {
        var i=transition(actor,id,Side.DESTINATION,match,Set.of("SENT")); outgoing(i);
        var time=input.receivedAt()==null ? validation.now() : input.receivedAt(); validation.chronology(time,i.getRequestedAt(),null);
        i.setReceivedAt(time); i.setStatus("RECEIVED"); return finish(actor,i,"CONTACT_INVESTIGATION_RECEIVED");
    }
    public InvestigationDetail start(CurrentActor actor,UUID id,String match) {
        var i=transition(actor,id,Side.DESTINATION,match,Set.of("RECEIVED")); outgoing(i); i.setStatus("IN_PROGRESS"); return finish(actor,i,"CONTACT_INVESTIGATION_STARTED");
    }
    public InvestigationDetail returnInvestigation(CurrentActor actor,UUID id,ReturnInput input,String match) {
        var i=transition(actor,id,Side.DESTINATION,match,Set.of("RECEIVED","IN_PROGRESS")); outgoing(i);
        String reason=text(input.returnReason()); if(reason==null) throw ApplicationFailure.invalid("Alasan pengembalian wajib diisi.");
        i.setReturnReason(reason); i.setStatus("RETURNED"); return finish(actor,i,"CONTACT_INVESTIGATION_RETURNED");
    }
    public InvestigationDetail cancel(CurrentActor actor,UUID id,String match) {
        var i=transition(actor,id,Side.SOURCE,match,Set.of("SENT")); outgoing(i); i.setStatus("CANCELLED"); return finish(actor,i,"CONTACT_INVESTIGATION_CANCELLED");
    }
    public InvestigationDetail complete(CurrentActor actor,UUID id,CompleteInput input,String match) {
        var i=transition(actor,id,Side.WORKING,match,Set.of("IN_PROGRESS"));
        if(input.activeTbExcluded()==null || input.tptEligible()==null || (input.tptEligible() && !input.activeTbExcluded())) throw ApplicationFailure.invalid("Pengecualian TB aktif dan kelayakan TPT harus dicatat secara eksplisit dan konsisten.");
        var time=input.investigatedAt()==null ? validation.now() : input.investigatedAt();
        if(i.getWorkflowType().equals("OUTGOING_REFERRAL") && i.getReceivedAt()==null) throw ContactErrors.state();
        validation.chronology(time,i.getRequestedAt(),i.getWorkflowType().equals("INTERNAL") ? null : i.getReceivedAt());
        i.setInvestigatedAt(time); i.setEligibilityAssessedAt(time); i.setResultCode(text(input.resultCode())); i.setActiveTbExcluded(input.activeTbExcluded()); i.setTptEligible(input.tptEligible());
        if(input.notes()!=null) i.setNotes(text(input.notes())); i.setStatus("COMPLETED"); return finish(actor,i,"CONTACT_INVESTIGATION_COMPLETED");
    }
    private ContactInvestigation transition(CurrentActor actor,UUID id,Side side,String match,Set<String> states) {
        var i=access.investigation(actor,"CONTACT_WRITE",id,side,true); IfMatch.require(match,i.getVersion());
        if(!states.contains(i.getStatus())) throw ContactErrors.state();
        UUID facility=switch(side) { case SOURCE -> i.getSourceFacility().getId(); case DESTINATION -> i.getDestinationFacility().getId(); case WORKING -> access.workingFacility(i).getId(); default -> throw new IllegalStateException("Transition side"); };
        source.requireLocalInvestigationTransition(actor,"CONTACT_WRITE",facility,id); return i;
    }
    private void outgoing(ContactInvestigation i) { if(!"OUTGOING_REFERRAL".equals(i.getWorkflowType())) throw ContactErrors.state(); }
    private InvestigationDetail finish(CurrentActor actor,ContactInvestigation i,String action) { ContactErrors.flush(em); audit.record(actor.userId(),action,"CONTACT_INVESTIGATION",i.getId()); return views.investigation(i); }
}
