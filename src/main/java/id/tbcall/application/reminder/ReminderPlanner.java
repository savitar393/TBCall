package id.tbcall.application.reminder;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class ReminderPlanner {
    private final ReminderStore store;private final ReminderPlanningWorker worker;private final ReminderProperties properties;
    public ReminderPlanner(ReminderStore store,ReminderPlanningWorker worker,ReminderProperties properties){this.store=store;this.worker=worker;this.properties=properties;}
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public int plan(){
        var candidates=store.jdbc().query("""
                select s.id,s.treatment_id,p.user_id from reminder_preferences p
                join patient_user_links l on l.id=p.patient_link_id and l.user_id=p.user_id and l.relationship_type='SELF' and l.verification_status='VERIFIED'
                join tb_registrations r on r.patient_id=l.patient_id join tb_cases c on c.registration_id=r.id
                join treatments t on t.case_id=c.id join medication_schedules s on s.treatment_id=t.id
                where (p.whatsapp_consent or p.email_consent or p.telegram_consent) and s.status='ACTIVE' and t.status='ACTIVE' and c.status='ACTIVE'
                order by p.last_planned_at nulls first,p.user_id,s.id limit ?
                """,(r,n)->new UUID[]{r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getObject(3,UUID.class)},properties.getBatchSize());
        int count=0;
        for(var candidate:candidates){
            if(count>=properties.getBatchSize())break;
            count+=worker.plan(candidate[0],candidate[1],candidate[2],properties.getBatchSize()-count);
        }
        return count;
    }
}
