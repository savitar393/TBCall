package id.tbcall.application.reminder;

import id.tbcall.authorization.CurrentActor;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class ChannelReminderService {
    private final ChannelTestAdmission admission;private final ReminderPlanner planner;private final ReminderDispatcher dispatcher;private final ReminderDispatchWorker worker;
    public ChannelReminderService(ChannelTestAdmission admission,ReminderPlanner planner,ReminderDispatcher dispatcher,ReminderDispatchWorker worker){this.admission=admission;this.planner=planner;this.dispatcher=dispatcher;this.worker=worker;}
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public int plan(CurrentActor actor,boolean confirmed){admission.request(actor,null,confirmed);return planner.plan();}
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public boolean dispatch(CurrentActor actor,UUID job,boolean confirmed){admission.request(actor,job,confirmed);worker.recover();return dispatcher.dispatchChannelTest(job);}
}
