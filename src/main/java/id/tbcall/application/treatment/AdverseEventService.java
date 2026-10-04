package id.tbcall.application.treatment;

import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalValidation.text;
import static id.tbcall.application.treatment.TreatmentDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class AdverseEventService {
    private final EntityManager em; private final TreatmentAccess access; private final TreatmentValidation validation;
    private final ClinicalSourceAuthorityPolicy source; private final TreatmentViews views; private final AuditService audit; private final Clock clock;
    public AdverseEventService(EntityManager em,TreatmentAccess access,TreatmentValidation validation,ClinicalSourceAuthorityPolicy source,TreatmentViews views,AuditService audit,Clock clock) {
        this.em=em; this.access=access; this.validation=validation; this.source=source; this.views=views; this.audit=audit; this.clock=clock;
    }
    public AdverseView create(CurrentActor actor,UUID id,AdverseInput input) {
        Treatment treatment=access.staff(actor,"ADVERSE_EVENT_WRITE",id,true); access.requireActive(treatment);
        source.requireLocalCreate(actor,"ADVERSE_EVENT_WRITE",treatment.getFacility().getId(),"ADVERSE_EVENT");
        AdverseEvent event=new AdverseEvent(); event.setTreatment(treatment); event.setEventType(text(input.getEventType())); event.setReportedAt(OffsetDateTime.now(clock));
        validation.merge(event,input); validation.adverse(event); em.persist(event); TreatmentErrors.flush(em);
        audit.record(actor.userId(),"ADVERSE_EVENT_RECORDED","ADVERSE_EVENT",event.getId()); return views.adverse(event);
    }
    public AdverseView update(CurrentActor actor,UUID id,AdverseUpdate input,String match) {
        UUID parent=access.childTreatment(actor,"ADVERSE_EVENT_WRITE","AdverseEvent",id); Treatment treatment=access.staff(actor,"ADVERSE_EVENT_WRITE",parent,true);
        AdverseEvent event=em.find(AdverseEvent.class,id,LockModeType.PESSIMISTIC_WRITE); IfMatch.require(match,event.getVersion());
        source.requireLocalEdit(actor,"ADVERSE_EVENT_WRITE",treatment.getFacility().getId(),"ADVERSE_EVENT",id);
        validation.merge(event,input); validation.adverse(event); TreatmentErrors.flush(em);
        audit.record(actor.userId(),"ADVERSE_EVENT_UPDATED","ADVERSE_EVENT",id); return views.adverse(event);
    }
}
