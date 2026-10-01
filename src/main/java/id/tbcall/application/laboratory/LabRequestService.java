package id.tbcall.application.laboratory;

import id.tbcall.application.clinical.ClinicalAccess;
import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.laboratory.LabDtos.*;
import static id.tbcall.application.laboratory.LabValidation.text;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class LabRequestService {
    private final EntityManager em;
    private final LabAccess access;
    private final ClinicalAccess clinical;
    private final LabValidation validation;
    private final LaboratorySourceAuthorityPolicy source;
    private final LabStatusService statuses;
    private final LabViews views;
    private final AuditService audit;
    private final Clock clock;
    public LabRequestService(EntityManager em,LabAccess access,ClinicalAccess clinical,LabValidation validation,
            LaboratorySourceAuthorityPolicy source,LabStatusService statuses,LabViews views,AuditService audit,Clock clock) {
        this.em=em; this.access=access; this.clinical=clinical; this.validation=validation; this.source=source;
        this.statuses=statuses; this.views=views; this.audit=audit; this.clock=clock;
    }
    public RequestDetail create(CurrentActor actor,CreateRequest input) {
        access.require(actor,LabAccess.Mode.SOURCE);
        if((input.registrationId()==null)==(input.caseId()==null)) throw ApplicationFailure.invalid("Pilih tepat satu pemilik: registrasi atau kasus.");
        String reason=text(input.requestReasonCode()); validation.reference("LabRequestReason",reason);
        var types=input.testTypeCodes().stream().map(LabValidation::text).toList();
        if(types.isEmpty() || types.size()>10 || new HashSet<>(types).size()!=types.size()) throw ApplicationFailure.invalid("Pilih 1 sampai 10 jenis pemeriksaan yang berbeda.");
        for(String type:types) validation.reference("LabTestType",type);
        LabRequest request=new LabRequest(); Facility requesting;
        if(input.registrationId()!=null) {
            if(!"DIAGNOSIS".equals(reason)) throw ApplicationFailure.invalid("Permintaan registrasi harus untuk diagnosis.");
            TBRegistration registration=clinical.registration(actor,"LAB_REQUEST_WRITE",input.registrationId(),true);
            if(!Set.of("OPEN","DIAGNOSED").contains(registration.getStatus())) throw LabErrors.requestState();
            request.setRegistration(registration); requesting=registration.getFacility();
        } else {
            if(!"FOLLOW_UP".equals(reason)) throw ApplicationFailure.invalid("Permintaan kasus harus untuk tindak lanjut.");
            TBCase tbCase=access.caseOwner(actor,input.caseId());
            if(!"ACTIVE".equals(tbCase.getStatus())) throw LabErrors.requestState();
            request.setTbCase(tbCase); requesting=tbCase.getCurrentFacility();
        }
        Facility testing=validation.testingFacility(input.testingFacilityId());
        source.requireLocalCreate(actor,"LAB_REQUEST_WRITE",requesting.getId(),"LAB_REQUEST");
        request.setRequestingFacility(requesting); request.setTestingFacility(testing); request.setRequestReasonCode(reason);
        request.setReferralType(requesting.getId().equals(testing.getId()) ? "INTERNAL" : "EXTERNAL");
        request.setRequestedAt(OffsetDateTime.now(clock)); request.setStatus("REQUESTED");
        request.setSampleShippingMethod(text(input.sampleShippingMethod())); request.setCourierName(text(input.courierName())); request.setNotes(text(input.notes()));
        em.persist(request);
        for(String type:types) { LabRequestTest test=new LabRequestTest(); test.setLabRequest(request); test.setTestTypeCode(type); test.setStatus("REQUESTED"); em.persist(test); }
        em.flush(); audit.record(actor.userId(),"LAB_REQUEST_CREATED","LAB_REQUEST",request.getId()); return views.detail(actor,request);
    }
    public SpecimenView specimen(CurrentActor actor,UUID id,RecordSpecimen input,String match) {
        LabRequest request=access.request(actor,id,LabAccess.Mode.SOURCE,true); IfMatch.require(match,request.getVersion());
        if(!Set.of("REQUESTED","SENT").contains(request.getStatus())) throw LabErrors.requestState();
        validation.specimen(input); source.requireLocalCreate(actor,"LAB_REQUEST_WRITE",request.getRequestingFacility().getId(),"LAB_SPECIMEN");
        long before=request.getVersion(); LabSpecimen specimen=new LabSpecimen(); specimen.setLabRequest(request);
        specimen.setSpecimenCode(text(input.specimenCode())); specimen.setSpecimenType(text(input.specimenType()));
        specimen.setCollectedAt(input.collectedAt()); specimen.setSentAt(input.sentAt()); specimen.setNotes(text(input.notes())); em.persist(specimen);
        statuses.recompute(request); statuses.advanceVersions(request,before,null,0);
        audit.record(actor.userId(),"LAB_SPECIMEN_RECORDED","LAB_SPECIMEN",specimen.getId()); return views.specimen(specimen);
    }
    public RequestDetail cancel(CurrentActor actor,UUID id,String match) {
        LabRequest request=access.request(actor,id,LabAccess.Mode.SOURCE,true); IfMatch.require(match,request.getVersion());
        if(!Set.of("REQUESTED","SENT","RECEIVED").contains(request.getStatus()) || statuses.hasFinalResult(request)) throw LabErrors.requestState();
        source.requireLocalEdit(actor,"LAB_REQUEST_WRITE",request.getRequestingFacility().getId(),"LAB_REQUEST",id);
        request.setStatus("CANCELLED");
        for(LabRequestTest test:statuses.tests(request)) test.setStatus("CANCELLED");
        em.flush(); audit.record(actor.userId(),"LAB_REQUEST_CANCELLED","LAB_REQUEST",id); return views.detail(actor,request);
    }
}
