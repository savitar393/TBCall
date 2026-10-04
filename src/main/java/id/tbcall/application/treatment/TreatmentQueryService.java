package id.tbcall.application.treatment;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.treatment.TreatmentDtos.*;

@Service
@Transactional(readOnly=true,isolation=Isolation.READ_COMMITTED)
public class TreatmentQueryService {
    private final EntityManager em; private final TreatmentAccess access; private final TreatmentViews views;
    public TreatmentQueryService(EntityManager em,TreatmentAccess access,TreatmentViews views) { this.em=em; this.access=access; this.views=views; }
    public TreatmentDetail staff(CurrentActor actor,UUID id) { return views.staff(access.staff(actor,"TREATMENT_READ",id,false),actor.permissions()); }
    public List<TreatmentDetail> caseTreatments(CurrentActor actor,UUID id) {
        access.staffCase(actor,"TREATMENT_READ",id,false);
        return em.createQuery("select t from Treatment t where t.tbCase.id=:id and t.facility.id in :facilities and t.facility.active=true order by t.startDate desc,t.createdAt desc,t.id desc",Treatment.class)
                .setParameter("id",id).setParameter("facilities",actor.facilityIds()).getResultList().stream().map(t -> views.staff(t,actor.permissions())).toList();
    }
    public PatientTreatment patient(CurrentActor actor) { return views.patient(access.self(actor,"TREATMENT_READ",false),actor.permissions()); }
    public SupporterTreatment supporter(CurrentActor actor,UUID id) { return views.supporter(access.supporting(actor,"TREATMENT_READ",id,false),actor.permissions()); }
    public List<SafeFollowUp> follows(CurrentActor actor) {
        UUID patient=access.selfPatient(actor,"FOLLOW_UP_READ");
        return em.createQuery("select f from FollowUp f where f.treatment.tbCase.registration.patient.id=:id order by f.scheduledAt desc,f.id desc",FollowUp.class).setParameter("id",patient).getResultList().stream().map(views::safeFollowUp).toList();
    }
    public DosePage<DoseView> staffDoses(CurrentActor actor,UUID id,int page,int size) {
        Treatment t=access.staff(actor,"ADHERENCE_READ",id,false); checkPage(page,size);
        return new DosePage<>(doses(t,page,size).stream().map(views::dose).toList(),page,size,count(t));
    }
    public DosePage<SafeDose> patientDoses(CurrentActor actor,int page,int size) { return safeDoses(access.self(actor,"ADHERENCE_READ",false),page,size); }
    public DosePage<SafeDose> supporterDoses(CurrentActor actor,UUID caseId,int page,int size) { return safeDoses(access.supporting(actor,"ADHERENCE_READ",caseId,false),page,size); }
    private DosePage<SafeDose> safeDoses(Treatment t,int page,int size) { checkPage(page,size); return new DosePage<>(doses(t,page,size).stream().map(views::safeDose).toList(),page,size,count(t)); }
    private List<DoseEvent> doses(Treatment t,int page,int size) { return em.createQuery("select d from DoseEvent d where d.treatment.id=:id order by d.scheduledDate desc,d.recordedAt desc,d.id desc",DoseEvent.class).setParameter("id",t.getId()).setFirstResult(page*size).setMaxResults(size).getResultList(); }
    private long count(Treatment t) { return em.createQuery("select count(d) from DoseEvent d where d.treatment.id=:id",Long.class).setParameter("id",t.getId()).getSingleResult(); }
    private void checkPage(int page,int size) { if(page<0 || size<1 || size>100 || (long)page*size>Integer.MAX_VALUE) throw ApplicationFailure.invalid("Halaman harus tidak negatif dan ukuran halaman antara 1 dan 100."); }
}
