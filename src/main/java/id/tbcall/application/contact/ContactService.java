package id.tbcall.application.contact;

import id.tbcall.application.clinical.PatientIdentityService;
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

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class ContactService {
    private final EntityManager em; private final ContactAccess access; private final ContactViews views; private final ContactValidation validation;
    private final ContactSourceAuthorityPolicy source; private final AuditService audit; private final PatientIdentityService identities;
    public ContactService(EntityManager em,ContactAccess access,ContactViews views,ContactValidation validation,ContactSourceAuthorityPolicy source,AuditService audit,PatientIdentityService identities) {
        this.em=em; this.access=access; this.views=views; this.validation=validation; this.source=source; this.audit=audit; this.identities=identities;
    }
    public ContactDetail create(CurrentActor actor,UUID caseId,CreateInput input) {
        TBCase owner=access.createCase(actor,caseId); String workflow=text(input.workflowType());
        if(!Set.of("INTERNAL","OUTGOING_REFERRAL").contains(workflow)) throw ApplicationFailure.invalid("Jenis alur investigasi tidak valid.");
        Facility destination=null;
        if(workflow.equals("INTERNAL")) { if(input.destinationFacilityId()!=null) throw ApplicationFailure.invalid("Investigasi internal tidak memiliki tujuan rujukan."); }
        else destination=access.destination(input.destinationFacilityId(),owner.getCurrentFacility().getId());
        source.requireLocalContactWrite(actor,"CONTACT_WRITE",owner.getCurrentFacility().getId(),caseId,null);
        Contact contact=new Contact(); contact.setIndexCase(owner); contact.setFullName(text(input.fullName())); contact.setBirthDate(input.birthDate()); contact.setSexCode(text(input.sexCode()));
        contact.setPhone(text(input.phone())); contact.setAddress(text(input.address())); contact.setRelationshipToIndexCase(text(input.relationshipToIndexCase())); contact.setHouseholdContact(input.householdContact()); validation.contact(contact);
        em.persist(contact);
        ContactInvestigation investigation=new ContactInvestigation(); investigation.setContact(contact); investigation.setWorkflowType(workflow); investigation.setSourceFacility(owner.getCurrentFacility());
        investigation.setDestinationFacility(destination); investigation.setRequestedAt(validation.now()); investigation.setStatus(destination==null ? "IN_PROGRESS" : "SENT"); investigation.setNotes(text(input.notes()));
        source.requireLocalInvestigationTransition(actor,"CONTACT_WRITE",owner.getCurrentFacility().getId(),null);
        em.persist(investigation); ContactErrors.flush(em); audit.record(actor.userId(),"CONTACT_CREATED","CONTACT",contact.getId());
        audit.record(actor.userId(),destination==null ? "CONTACT_INVESTIGATION_STARTED" : "CONTACT_INVESTIGATION_SENT","CONTACT_INVESTIGATION",investigation.getId()); return views.contact(actor,contact);
    }
    public ContactDetail patch(CurrentActor actor,UUID id,ContactPatch input,String match) {
        Contact c=access.contact(actor,"CONTACT_WRITE",id,true); IfMatch.require(match,c.getVersion());
        source.requireLocalContactWrite(actor,"CONTACT_WRITE",access.contactFacility(actor,c),c.getIndexCase().getId(),id);
        validation.merge(c,input); validation.contact(c); return finish(actor,c,"CONTACT_UPDATED");
    }
    public ContactDetail link(CurrentActor actor,UUID id,LinkInput input,String match) {
        Contact c=access.contact(actor,"CONTACT_WRITE",id,true); IfMatch.require(match,c.getVersion());
        if(c.getLinkedPatient()!=null) throw ContactErrors.linked();
        if(!input.confirmation().hasConfirmation()) throw ApplicationFailure.invalid("Konfirmasi identitas WNI/WNA wajib diisi.");
        source.requireLocalContactWrite(actor,"CONTACT_WRITE",access.contactFacility(actor,c),c.getIndexCase().getId(),id);
        c.setLinkedPatient(identities.existing(actor,input.confirmation())); return finish(actor,c,"CONTACT_LINKED_PATIENT");
    }
    private ContactDetail finish(CurrentActor actor,Contact c,String action) { ContactErrors.flush(em); audit.record(actor.userId(),action,"CONTACT",c.getId()); return views.contact(actor,c); }
}
