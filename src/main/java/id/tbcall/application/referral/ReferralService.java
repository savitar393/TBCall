package id.tbcall.application.referral;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalValidation.text;
import static id.tbcall.application.referral.ReferralDtos.*;
import static id.tbcall.application.referral.ReferralAccess.Side;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class ReferralService {
    private final EntityManager em; private final ReferralAccess access; private final ReferralViews views;
    private final ReferralSourceAuthorityPolicy source; private final AuditService audit; private final Clock clock;
    public ReferralService(EntityManager em,ReferralAccess access,ReferralViews views,ReferralSourceAuthorityPolicy source,AuditService audit,Clock clock) {
        this.em=em; this.access=access; this.views=views; this.source=source; this.audit=audit; this.clock=clock;
    }
    public Detail send(CurrentActor actor,UUID caseId,SendInput input) {
        TBCase owner=access.sendCase(actor,caseId);
        String type=text(input.referralType());
        if(!Set.of("PRE_TREATMENT_REFERRAL","TREATMENT_TRANSFER").contains(type)) throw ApplicationFailure.invalid("Jenis rujukan tidak valid.");
        Facility destination=access.destination(input.destinationFacilityId(),owner.getCurrentFacility().getId());
        Treatment treatment=null;
        if(type.equals("PRE_TREATMENT_REFERRAL")) {
            Diagnosis diagnosis=owner.getConfirmingDiagnosis();
            if(input.treatmentId()!=null || !"REFERRED".equals(owner.getStatus()) || openTreatment(caseId) || diagnosis==null
                    || !"REFERRED".equals(diagnosis.getTreatmentDisposition()) || diagnosis.getReferredToFacility()==null
                    || !destination.getId().equals(diagnosis.getReferredToFacility().getId())) throw ReferralErrors.state();
        } else {
            if(input.treatmentId()==null) throw ReferralErrors.mismatch();
            treatment=access.treatment(owner,input.treatmentId());
            if(!"ACTIVE".equals(owner.getStatus())) throw ReferralErrors.state();
            transferTreatment(treatment,owner.getCurrentFacility().getId());
        }
        if(em.createQuery("select count(r) from Referral r where r.tbCase.id=:id and r.status in ('SENT','RECEIVED')",Long.class).setParameter("id",caseId).getSingleResult()>0) throw ReferralErrors.inflight();
        source.requireLocalCreate(actor,"REFERRAL_WRITE",owner.getCurrentFacility().getId(),caseId);
        Referral referral=new Referral(); referral.setTbCase(owner); referral.setTreatment(treatment); referral.setReferralType(type);
        referral.setSourceFacility(owner.getCurrentFacility()); referral.setDestinationFacility(destination); referral.setSentAt(now()); referral.setStatus("SENT"); referral.setNotes(text(input.notes()));
        if(treatment!=null) owner.setStatus("REFERRED");
        em.persist(referral); return finish(actor,referral,"REFERRAL_SENT");
    }
    public Detail receive(CurrentActor actor,UUID id,ReceiveInput input,String match) {
        Referral referral=transition(actor,id,Side.DESTINATION,match,"SENT");
        OffsetDateTime received=input.receivedAt()==null ? now() : input.receivedAt();
        chronological(received,referral.getSentAt(),null);
        referral.setReceivedAt(received); referral.setStatus("RECEIVED");
        if(input.notes()!=null) referral.setNotes(text(input.notes()));
        return finish(actor,referral,"REFERRAL_RECEIVED");
    }
    public Detail returnReferral(CurrentActor actor,UUID id,ReturnInput input,String match) {
        Referral referral=transition(actor,id,Side.DESTINATION,match,"RECEIVED");
        restoreSource(referral); referral.setReturnReason(reason(input.returnReason())); referral.setStatus("RETURNED");
        return finish(actor,referral,"REFERRAL_RETURNED");
    }
    public Detail cancel(CurrentActor actor,UUID id,CancelInput input,String match) {
        Referral referral=transition(actor,id,Side.SOURCE,match,"SENT");
        restoreSource(referral); chronological(now(),referral.getSentAt(),null);
        referral.setCancelledAt(now()); referral.setCancelReason(reason(input.cancelReason())); referral.setStatus("CANCELLED");
        return finish(actor,referral,"REFERRAL_CANCELLED");
    }
    public Detail report(CurrentActor actor,UUID id,ReportInput input,String match) {
        Referral referral=transition(actor,id,Side.DESTINATION,match,"RECEIVED");
        OffsetDateTime reported=input.patientReportedAt()==null ? now() : input.patientReportedAt();
        chronological(reported,referral.getSentAt(),referral.getReceivedAt());
        parentAtSource(referral);
        if(referral.getReferralType().equals("PRE_TREATMENT_REFERRAL")) {
            if(referral.getTreatment()!=null || openTreatment(referral.getTbCase().getId())) throw ReferralErrors.state();
        } else {
            if(referral.getTreatment()==null) throw ReferralErrors.mismatch();
            transferTreatment(referral.getTreatment(),referral.getSourceFacility().getId());
            referral.getTreatment().setFacility(referral.getDestinationFacility());
        }
        referral.getTbCase().setCurrentFacility(referral.getDestinationFacility()); referral.getTbCase().setStatus("ACTIVE");
        referral.setPatientReportedAt(reported); referral.setStatus("REPORTED");
        return finish(actor,referral,"REFERRAL_REPORTED");
    }
    private Referral transition(CurrentActor actor,UUID id,Side side,String match,String expected) {
        Referral referral=access.existing(actor,id,side,true); IfMatch.require(match,referral.getVersion());
        if(!expected.equals(referral.getStatus())) throw ReferralErrors.state();
        UUID facility=side==Side.SOURCE ? referral.getSourceFacility().getId() : referral.getDestinationFacility().getId();
        source.requireLocalTransition(actor,"REFERRAL_WRITE",facility,id);
        return referral;
    }
    private void parentAtSource(Referral referral) {
        if(!"REFERRED".equals(referral.getTbCase().getStatus()) || !referral.getSourceFacility().getId().equals(referral.getTbCase().getCurrentFacility().getId())) throw ReferralErrors.state();
    }
    private void restoreSource(Referral referral) {
        parentAtSource(referral);
        if(referral.getReferralType().equals("TREATMENT_TRANSFER")) {
            if(referral.getTreatment()==null) throw ReferralErrors.mismatch();
            transferTreatment(referral.getTreatment(),referral.getSourceFacility().getId()); referral.getTbCase().setStatus("ACTIVE");
        }
    }
    private void transferTreatment(Treatment treatment,UUID facility) {
        if(!"ACTIVE".equals(treatment.getStatus()) || !facility.equals(treatment.getFacility().getId())
                || em.createQuery("select count(o) from TreatmentOutcome o where o.treatment.id=:id",Long.class).setParameter("id",treatment.getId()).getSingleResult()>0) throw ReferralErrors.mismatch();
    }
    private boolean openTreatment(UUID caseId) {
        return em.createQuery("select count(t) from Treatment t where t.tbCase.id=:id and t.status in ('PLANNED','ACTIVE','PAUSED')",Long.class).setParameter("id",caseId).getSingleResult()>0;
    }
    private void chronological(OffsetDateTime time,OffsetDateTime sent,OffsetDateTime received) {
        if(time.isAfter(now()) || time.isBefore(sent) || (received!=null && time.isBefore(received))) throw ApplicationFailure.invalid("Waktu rujukan tidak boleh mendahului tahap sebelumnya atau berada di masa depan.");
    }
    private String reason(String value) { String reason=text(value); if(reason==null) throw ApplicationFailure.invalid("Alasan wajib diisi."); return reason; }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
    private Detail finish(CurrentActor actor,Referral referral,String action) {
        ReferralErrors.flush(em); audit.record(actor.userId(),action,"REFERRAL",referral.getId()); return views.detail(referral);
    }
}
