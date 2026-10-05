package id.tbcall.application.contact;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.contact.ContactDtos.*;
import static id.tbcall.application.contact.ContactAccess.Side;

@Service
@Transactional(readOnly=true,isolation=Isolation.READ_COMMITTED)
public class ContactQueryService {
    private final EntityManager em; private final ContactAccess access; private final ContactViews views;
    public ContactQueryService(EntityManager em,ContactAccess access,ContactViews views) { this.em=em; this.access=access; this.views=views; }
    public ContactDetail contact(CurrentActor actor,UUID id) { return views.contact(actor,access.contact(actor,"CONTACT_READ",id,false)); }
    public Page<ContactDetail> contacts(CurrentActor actor,UUID caseId,int page,int size) {
        access.officer(actor,"CONTACT_READ"); access.page(page,size);
        long visible=em.createQuery("select count(k) from TBCase k where k.id=:id and ((k.currentFacility.id in :facilities and k.currentFacility.active=true) or exists (select c.id from Contact c where c.indexCase.id=k.id and "+ContactAccess.contactScope()+"))",Long.class)
                .setParameter("id",caseId).setParameter("facilities",actor.facilityIds()).getSingleResult();
        if(visible==0) throw ApplicationFailure.missing();
        String where="c.indexCase.id=:id and "+ContactAccess.contactScope();
        long count=em.createQuery("select count(c) from Contact c where "+where,Long.class).setParameter("id",caseId).setParameter("facilities",actor.facilityIds()).getSingleResult();
        var rows=em.createQuery("select c from Contact c where "+where+" order by c.createdAt desc,c.id desc",Contact.class)
                .setParameter("id",caseId).setParameter("facilities",actor.facilityIds()).setFirstResult(page*size).setMaxResults(size).getResultList();
        return new Page<>(rows.stream().map(c -> views.contact(actor,c)).toList(),page,size,count);
    }
    public InvestigationDetail investigation(CurrentActor actor,UUID id) { return views.investigation(access.investigation(actor,"CONTACT_READ",id,Side.BOTH,false)); }
    public Page<InvestigationDetail> incoming(CurrentActor actor,int page,int size) { return investigations(actor,Side.DESTINATION,page,size); }
    public Page<InvestigationDetail> outgoing(CurrentActor actor,int page,int size) { return investigations(actor,Side.SOURCE,page,size); }
    private Page<InvestigationDetail> investigations(CurrentActor actor,Side side,int page,int size) {
        access.officer(actor,"CONTACT_READ"); access.page(page,size);
        String where="i.workflowType='OUTGOING_REFERRAL' and "+ContactAccess.investigationScope(side);
        long count=em.createQuery("select count(i) from ContactInvestigation i where "+where,Long.class).setParameter("facilities",actor.facilityIds()).getSingleResult();
        var rows=em.createQuery("select i from ContactInvestigation i where "+where+" order by i.requestedAt desc,i.id desc",ContactInvestigation.class)
                .setParameter("facilities",actor.facilityIds()).setFirstResult(page*size).setMaxResults(size).getResultList();
        return new Page<>(rows.stream().map(views::investigation).toList(),page,size,count);
    }
    public TptDetail tpt(CurrentActor actor,UUID id) { return views.tpt(access.tpt(actor,"TPT_READ",id,false)); }
    public Page<TptDetail> tptHistory(CurrentActor actor,UUID contactId,int page,int size) {
        access.officer(actor,"TPT_READ"); access.page(page,size);
        // TPT history belongs to its recorded facility, including legacy contacts without investigations.
        long visible=em.createQuery("select count(c) from Contact c where c.id=:id and ("+ContactAccess.contactScope()
                +" or exists (select p.id from PreventiveTreatment p where p.contact.id=c.id and p.facility.id in :facilities and p.facility.active=true))",Long.class)
                .setParameter("id",contactId).setParameter("facilities",actor.facilityIds()).getSingleResult();
        if(visible==0) throw ApplicationFailure.missing();
        String where="t.contact.id=:id and t.facility.id in :facilities and t.facility.active=true";
        long count=em.createQuery("select count(t) from PreventiveTreatment t where "+where,Long.class).setParameter("id",contactId).setParameter("facilities",actor.facilityIds()).getSingleResult();
        var rows=em.createQuery("select t from PreventiveTreatment t where "+where+" order by t.startDate desc,t.createdAt desc,t.id desc",PreventiveTreatment.class)
                .setParameter("id",contactId).setParameter("facilities",actor.facilityIds()).setFirstResult(page*size).setMaxResults(size).getResultList();
        return new Page<>(rows.stream().map(views::tpt).toList(),page,size,count);
    }
    public SafeTpt self(CurrentActor actor) {
        if(!actor.hasRole("PATIENT") || !actor.permissions().contains("TPT_READ") || actor.selfPatientId()==null) throw ApplicationFailure.forbidden();
        String from="from PreventiveTreatment t left join t.patient p left join t.contact c left join c.linkedPatient lp where (p.id=:patient or lp.id=:patient)";
        long active=em.createQuery("select count(t) "+from+" and t.status='ACTIVE'",Long.class).setParameter("patient",actor.selfPatientId()).getSingleResult();
        if(active>1) throw new ApplicationFailure(409,"ACTIVE_TPT_AMBIGUOUS","TPT aktif belum pasti","Lebih dari satu TPT aktif tersedia. Hubungi petugas untuk memastikan episode yang benar.");
        var ids=em.createQuery("select t.id "+from+" order by t.startDate desc,t.createdAt desc,t.id desc",UUID.class).setParameter("patient",actor.selfPatientId()).setMaxResults(1).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing(); return views.safe(em.find(PreventiveTreatment.class,ids.getFirst()));
    }
}
