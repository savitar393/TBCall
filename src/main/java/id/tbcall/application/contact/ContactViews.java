package id.tbcall.application.contact;

import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.contact.ContactDtos.*;
import static id.tbcall.application.contact.ContactAccess.Side;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class ContactViews {
    private final EntityManager em;
    public ContactViews(EntityManager em) { this.em=em; }
    public ContactDetail contact(CurrentActor actor,Contact c) {
        var investigations=em.createQuery("select i from ContactInvestigation i where i.contact.id=:id and "+ContactAccess.investigationScope(Side.BOTH)+" order by i.requestedAt desc,i.id desc",ContactInvestigation.class)
                .setParameter("id",c.getId()).setParameter("facilities",actor.facilityIds()).getResultList().stream()
                .map(i -> new InvestigationSummary(i.getId(),i.getVersion(),i.getWorkflowType(),i.getStatus(),i.getRequestedAt())).toList();
        var tpt=actor.permissions().contains("TPT_READ") ? em.createQuery("select t from PreventiveTreatment t where t.contact.id=:id and t.facility.id in :facilities and t.facility.active=true order by t.startDate desc,t.id desc",PreventiveTreatment.class)
                .setParameter("id",c.getId()).setParameter("facilities",actor.facilityIds()).getResultList().stream()
                .map(t -> new TptSummary(t.getId(),t.getVersion(),t.getStatus(),t.getStartDate(),facility(t.getFacility()))).toList() : java.util.List.<TptSummary>of();
        return new ContactDetail(c.getId(),c.getVersion(),c.getFullName(),c.getBirthDate(),c.getSexCode(),phone(c.getPhone()),c.getAddress(),
                c.getRelationshipToIndexCase(),c.getHouseholdContact(),c.getLinkedPatient()!=null,investigations,tpt);
    }
    public InvestigationDetail investigation(ContactInvestigation i) {
        Contact c=i.getContact();
        return new InvestigationDetail(i.getId(),i.getVersion(),i.getWorkflowType(),i.getStatus(),i.getRequestedAt(),i.getReceivedAt(),i.getInvestigatedAt(),i.getEligibilityAssessedAt(),
                facility(i.getSourceFacility()),facility(i.getDestinationFacility()),new ContactDisplay(c.getId(),c.getFullName(),c.getBirthDate(),c.getSexCode(),phone(c.getPhone())),
                new CaseDisplay(c.getIndexCase().getId(),c.getIndexCase().getCaseCategoryCode()),i.getResultCode(),i.getActiveTbExcluded(),i.getTptEligible(),i.getNotes(),i.getReturnReason());
    }
    public TptDetail tpt(PreventiveTreatment t) {
        return new TptDetail(t.getId(),t.getVersion(),t.getContact().getId(),t.getIndexCase()==null ? null : t.getIndexCase().getId(),facility(t.getFacility()),t.getStatus(),
                t.getRegimen()==null ? null : t.getRegimen().getCode(),t.getRegimen()==null ? null : t.getRegimen().getName(),t.getRegimenDescription(),t.getStartDate(),t.getPlannedEndDate(),t.getActualEndDate(),
                t.getDurationValue(),t.getDurationUnit(),t.getWeightKg(),t.getDrugSource(),t.getNotes(),t.getClosureReason());
    }
    public SafeTpt safe(PreventiveTreatment t) {
        return new SafeTpt(t.getStatus(),t.getRegimen()==null ? t.getRegimenDescription() : t.getRegimen().getName(),t.getRegimenDescription(),t.getStartDate(),t.getPlannedEndDate(),
                t.getActualEndDate(),t.getDurationValue(),t.getDurationUnit(),facility(t.getFacility()));
    }
    private FacilityDisplay facility(Facility f) { return f==null ? null : new FacilityDisplay(f.getId(),f.getName()); }
    private String phone(String value) { return value==null ? null : "***"+value.substring(Math.max(0,value.length()-4)); }
}
