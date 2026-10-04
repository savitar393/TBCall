package id.tbcall.application.laboratory;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.laboratory.LabDtos.*;
import static id.tbcall.application.laboratory.LabValidation.text;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class LabResultService {
    private final EntityManager em;
    private final LabAccess access;
    private final LabValidation validation;
    private final LaboratorySourceAuthorityPolicy source;
    private final LabStatusService statuses;
    private final LabViews views;
    private final AuditService audit;
    public LabResultService(EntityManager em,LabAccess access,LabValidation validation,LaboratorySourceAuthorityPolicy source,LabStatusService statuses,LabViews views,AuditService audit) {
        this.em=em; this.access=access; this.validation=validation; this.source=source; this.statuses=statuses; this.views=views; this.audit=audit;
    }
    public ResultResponse record(CurrentActor actor,UUID testId,RecordResult input,String match) {
        UUID requestId=access.testRequest(actor,testId);
        LabRequest request=access.request(actor,requestId,LabAccess.Mode.LAB,true);
        LabRequestTest test=em.find(LabRequestTest.class,testId,LockModeType.PESSIMISTIC_WRITE); IfMatch.require(match,test.getVersion());
        writable(request,test); validation.result(input.testedAt(),input.resultCode(),input.resultValue(),input.resultText());
        LabSpecimen specimen=null;
        if(input.specimenId()!=null) {
            var found=em.createQuery("select s from LabSpecimen s where s.id=:id and s.labRequest.id=:request",LabSpecimen.class)
                    .setParameter("id",input.specimenId()).setParameter("request",requestId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
            if(found.isEmpty()) throw ApplicationFailure.missing(); specimen=found.getFirst();
            if(!Boolean.TRUE.equals(specimen.getExaminationPossible())) throw LabErrors.specimenState();
        }
        if(hasReportedResult(test,specimen)) throw LabErrors.alreadyExists();
        source.requireLocalCreate(actor,"LAB_RESULT_WRITE",request.getTestingFacility().getId(),"LAB_RESULT");
        return append(actor,request,test,specimen,nextSequence(test,specimen),"FINAL",input.testedAt(),input.resultCode(),input.resultValue(),input.resultText(),"LAB_RESULT_RECORDED");
    }
    public ResultResponse correct(CurrentActor actor,UUID id,CorrectResult input,String match) {
        UUID requestId=access.resultRequest(actor,id);
        // Lock the owner before the request, without hydrating an old owner snapshot.
        // Case confirmation takes the same registration lock. Phase 3B outcome writes
        // must take the case lock before writing an outcome to serialize this gate.
        Object[] owner=em.createQuery("select reg.id,c.id from LabRequest r left join r.registration reg left join r.tbCase c where r.id=:id",Object[].class)
                .setParameter("id",requestId).getSingleResult();
        TBRegistration registration=owner[0]==null ? null : em.find(TBRegistration.class,owner[0],LockModeType.PESSIMISTIC_WRITE);
        TBCase tbCase=owner[1]==null ? null : em.find(TBCase.class,owner[1],LockModeType.PESSIMISTIC_WRITE);
        LabRequest request=access.request(actor,requestId,LabAccess.Mode.LAB,true);
        UUID testId=em.createQuery("select v.labRequestTest.id from LabResult v where v.id=:id",UUID.class).setParameter("id",id).getSingleResult();
        LabRequestTest test=em.find(LabRequestTest.class,testId,LockModeType.PESSIMISTIC_WRITE);
        LabResult original=em.find(LabResult.class,id,LockModeType.PESSIMISTIC_WRITE); IfMatch.require(match,original.getVersion());
        writable(request,test);
        if(!Set.of("FINAL","CORRECTED").contains(original.getStatus())) throw LabErrors.resultState();
        if(nextSequence(test,original.getSpecimen())!=original.getSequenceNo()+1) throw LabErrors.notLatest();
        if(registration!=null) {
            if(!"DIAGNOSIS".equals(request.getRequestReasonCode()) || !Set.of("OPEN","DIAGNOSED").contains(registration.getStatus())) throw LabErrors.resultState();
        } else if(!"FOLLOW_UP".equals(request.getRequestReasonCode()) || em.createQuery("select count(o) from TreatmentOutcome o where o.treatment.tbCase.id=:id",Long.class)
                .setParameter("id",tbCase.getId()).getSingleResult()>0) throw LabErrors.resultState();
        validation.result(input.testedAt(),input.resultCode(),input.resultValue(),input.resultText());
        source.requireLocalEdit(actor,"LAB_RESULT_WRITE",request.getTestingFacility().getId(),"LAB_RESULT",id);
        return append(actor,request,test,original.getSpecimen(),original.getSequenceNo()+1,"CORRECTED",input.testedAt(),input.resultCode(),input.resultValue(),input.resultText(),"LAB_RESULT_CORRECTED");
    }
    private void writable(LabRequest request,LabRequestTest test) {
        if("CANCELLED".equals(request.getStatus()) || "CANCELLED".equals(test.getStatus())) throw LabErrors.resultState();
    }
    private boolean hasReportedResult(LabRequestTest test,LabSpecimen specimen) {
        // The request/test locks serialize first entry. Nonfinal history only affects
        // nextSequence; an already reported lineage must use the correction command.
        var query=em.createQuery("select count(v) from LabResult v where v.labRequestTest.id=:test and v.status in ('FINAL','CORRECTED') and "+(specimen==null ? "v.specimen is null" : "v.specimen.id=:specimen"),Long.class).setParameter("test",test.getId());
        if(specimen!=null) query.setParameter("specimen",specimen.getId());
        return query.getSingleResult()>0;
    }
    private int nextSequence(LabRequestTest test,LabSpecimen specimen) {
        var query=em.createQuery("select max(v.sequenceNo) from LabResult v where v.labRequestTest.id=:test and "+(specimen==null ? "v.specimen is null" : "v.specimen.id=:specimen"),Integer.class).setParameter("test",test.getId());
        if(specimen!=null) query.setParameter("specimen",specimen.getId());
        Integer max=query.getSingleResult(); return max==null ? 1 : Math.addExact(max,1);
    }
    private ResultResponse append(CurrentActor actor,LabRequest request,LabRequestTest test,LabSpecimen specimen,int sequence,String status,OffsetDateTime testedAt,String code,String value,String narrative,String action) {
        long before=request.getVersion(),testBefore=test.getVersion();
        LabResult result=new LabResult(); result.setLabRequestTest(test); result.setSpecimen(specimen); result.setSequenceNo(sequence); result.setStatus(status);
        result.setTestedAt(testedAt); result.setResultCode(text(code)); result.setResultValue(text(value)); result.setResultText(text(narrative)); em.persist(result);
        statuses.recompute(request); statuses.advanceVersions(request,before,test,testBefore);
        audit.record(actor.userId(),action,"LAB_RESULT",result.getId()); return views.result(result);
    }
}
