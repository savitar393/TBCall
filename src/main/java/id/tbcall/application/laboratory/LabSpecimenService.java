package id.tbcall.application.laboratory;

import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.laboratory.LabDtos.*;
import static id.tbcall.application.laboratory.LabValidation.text;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class LabSpecimenService {
    private final EntityManager em;
    private final LabAccess access;
    private final LabValidation validation;
    private final LaboratorySourceAuthorityPolicy source;
    private final LabStatusService statuses;
    private final LabViews views;
    private final AuditService audit;
    public LabSpecimenService(EntityManager em,LabAccess access,LabValidation validation,LaboratorySourceAuthorityPolicy source,LabStatusService statuses,LabViews views,AuditService audit) {
        this.em=em; this.access=access; this.validation=validation; this.source=source; this.statuses=statuses; this.views=views; this.audit=audit;
    }
    public SpecimenView receive(CurrentActor actor,UUID id,ReceiveSpecimen input,String match) {
        UUID requestId=access.specimenRequest(actor,id);
        LabRequest request=access.request(actor,requestId,LabAccess.Mode.LAB,true);
        LabSpecimen specimen=em.find(LabSpecimen.class,id,LockModeType.PESSIMISTIC_WRITE); IfMatch.require(match,specimen.getVersion());
        if(!Set.of("REQUESTED","SENT","RECEIVED").contains(request.getStatus())) throw LabErrors.requestState();
        if(specimen.getReceivedAt()!=null) throw LabErrors.specimenState();
        validation.receive(specimen,input); source.requireLocalEdit(actor,"LAB_RESULT_WRITE",request.getTestingFacility().getId(),"LAB_SPECIMEN",id);
        long before=request.getVersion(); specimen.setReceivedAt(input.receivedAt()); specimen.setConditionOnReceipt(text(input.conditionOnReceipt()));
        specimen.setExaminationPossible(input.examinationPossible()); specimen.setRejectionReason(input.examinationPossible() ? null : text(input.rejectionReason()));
        if(input.notes()!=null) specimen.setNotes(text(input.notes()));
        statuses.recompute(request); statuses.advanceVersions(request,before,null,0);
        audit.record(actor.userId(),input.examinationPossible() ? "LAB_SPECIMEN_RECEIVED" : "LAB_SPECIMEN_REJECTED","LAB_SPECIMEN",id);
        return views.specimen(specimen);
    }
}
