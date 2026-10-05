package id.tbcall.application.contact;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class ContactAccess {
    public enum Side { SOURCE,DESTINATION,BOTH,WORKING }
    private final EntityManager em;
    private final ClinicalAccess clinical;
    public ContactAccess(EntityManager em,ClinicalAccess clinical) { this.em=em; this.clinical=clinical; }
    public void officer(CurrentActor actor,String permission) { clinical.officer(actor,permission); }
    public boolean assigned(CurrentActor actor,Facility f) { return f!=null && actor.facilityIds().contains(f.getId()) && Boolean.TRUE.equals(f.getActive()); }
    public TBCase createCase(CurrentActor actor,UUID id) {
        officer(actor,"CONTACT_WRITE");
        var ids=em.createQuery("select c.id from TBCase c where c.id=:id and c.currentFacility.id in :facilities and c.currentFacility.active=true",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing();
        TBCase owner=em.find(TBCase.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(!assigned(actor,owner.getCurrentFacility())) throw ApplicationFailure.missing(); return owner;
    }
    public Facility destination(UUID id,UUID source) {
        if(id==null || id.equals(source)) throw ApplicationFailure.invalid("Tujuan investigasi harus aktif dan berbeda dari sumber.");
        Facility f=em.find(Facility.class,id,LockModeType.PESSIMISTIC_READ);
        if(f==null || !Boolean.TRUE.equals(f.getActive())) throw ApplicationFailure.invalid("Tujuan investigasi harus aktif dan berbeda dari sumber."); return f;
    }
    public static String investigationScope(Side side) {
        // Facility-id predicates preserve INTERNAL rows with a null destination: no implicit inner join.
        String source="(i.sourceFacility.id in :facilities and i.sourceFacility.id in (select fs.id from Facility fs where fs.active=true))",
                destination="(i.destinationFacility.id in :facilities and i.destinationFacility.id in (select fd.id from Facility fd where fd.active=true))";
        return switch(side) {
            case SOURCE -> source;
            case DESTINATION -> destination;
            case BOTH -> "("+source+" or "+destination+")";
            case WORKING -> "((i.workflowType='INTERNAL' and "+source+") or (i.workflowType='OUTGOING_REFERRAL' and "+destination+"))";
        };
    }
    public static String contactScope() {
        return "(exists (select i.id from ContactInvestigation i where i.contact.id=c.id and "+investigationScope(Side.BOTH)+")"
                +" or (not exists (select j.id from ContactInvestigation j where j.contact.id=c.id) and c.indexCase.currentFacility.id in :facilities and c.indexCase.currentFacility.active=true))";
    }
    public Contact contact(CurrentActor actor,String permission,UUID id,boolean lock) {
        officer(actor,permission); if(!visibleContact(actor,id)) throw ApplicationFailure.missing();
        Contact c=lock ? em.find(Contact.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(Contact.class,id);
        if(!visibleContact(actor,id)) throw ApplicationFailure.missing(); return c;
    }
    private boolean visibleContact(CurrentActor actor,UUID id) {
        return em.createQuery("select count(c) from Contact c where c.id=:id and "+contactScope(),Long.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getSingleResult()>0;
    }
    public UUID contactFacility(CurrentActor actor,Contact c) {
        var rows=em.createQuery("select i.sourceFacility.id,i.destinationFacility.id from ContactInvestigation i where i.contact.id=:id and "+investigationScope(Side.BOTH)+" order by i.requestedAt desc,i.id desc",Object[].class)
                .setParameter("id",c.getId()).setParameter("facilities",actor.facilityIds()).getResultList();
        for(Object[] row:rows) { for(Object f:row) if(f!=null && actor.facilityIds().contains((UUID)f) && assigned(actor,em.find(Facility.class,f))) return (UUID)f; }
        if(rows.isEmpty() && assigned(actor,c.getIndexCase().getCurrentFacility())) return c.getIndexCase().getCurrentFacility().getId();
        throw ApplicationFailure.missing();
    }
    public ContactInvestigation investigation(CurrentActor actor,String permission,UUID id,Side side,boolean lock) {
        officer(actor,permission);
        // Scope IDs first, with no managed Contact/Investigation until after the parent lock.
        var ids=em.createQuery("select i.contact.id from ContactInvestigation i where i.id=:id and "+investigationScope(side),UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing();
        if(lock) em.find(Contact.class,ids.getFirst(),LockModeType.PESSIMISTIC_WRITE);
        ContactInvestigation i=lock ? em.find(ContactInvestigation.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(ContactInvestigation.class,id);
        boolean allowed=switch(side) {
            case SOURCE -> assigned(actor,i.getSourceFacility()); case DESTINATION -> assigned(actor,i.getDestinationFacility());
            case BOTH -> assigned(actor,i.getSourceFacility()) || assigned(actor,i.getDestinationFacility());
            case WORKING -> assigned(actor,workingFacility(i));
        };
        if(!allowed) throw ApplicationFailure.missing(); return i;
    }
    public Facility workingFacility(ContactInvestigation i) {
        return switch(i.getWorkflowType()) { case "INTERNAL" -> i.getSourceFacility(); case "OUTGOING_REFERRAL" -> i.getDestinationFacility(); default -> null; };
    }
    public PreventiveTreatment tpt(CurrentActor actor,String permission,UUID id,boolean lock) {
        officer(actor,permission);
        var ids=em.createQuery("select t.contact.id from PreventiveTreatment t where t.id=:id and t.contact is not null and t.facility.id in :facilities and t.facility.active=true",UUID.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList();
        if(ids.isEmpty()) throw ApplicationFailure.missing();
        if(lock) em.find(Contact.class,ids.getFirst(),LockModeType.PESSIMISTIC_WRITE);
        PreventiveTreatment t=lock ? em.find(PreventiveTreatment.class,id,LockModeType.PESSIMISTIC_WRITE) : em.find(PreventiveTreatment.class,id);
        if(!assigned(actor,t.getFacility())) throw ApplicationFailure.missing(); return t;
    }
    public void page(int page,int size) { if(page<0 || size<1 || size>50 || (long)page*size>Integer.MAX_VALUE) throw ApplicationFailure.invalid("Halaman tidak valid; ukuran halaman harus 1 sampai 50."); }
}
