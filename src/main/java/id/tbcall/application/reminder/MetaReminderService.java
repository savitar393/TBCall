package id.tbcall.application.reminder;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import java.time.Clock;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class MetaReminderService {
    private final MetaReminderSafety safety;
    private final ReminderCallbackVerifier verifier;
    private final ReminderProviderEventWorker events;
    private final ReminderDispatcher dispatcher;
    private final ReminderPlanner planner;
    private final ReminderDispatchWorker worker;
    private final MetaTestAdmission admission;
    private final Clock clock;
    public MetaReminderService(MetaReminderSafety safety,ReminderCallbackVerifier verifier,ReminderProviderEventWorker events,
            ReminderDispatcher dispatcher,ReminderPlanner planner,ReminderDispatchWorker worker,MetaTestAdmission admission,Clock clock){
        this.safety=safety;this.verifier=verifier;this.events=events;this.dispatcher=dispatcher;this.planner=planner;this.worker=worker;this.admission=admission;this.clock=clock;
    }
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public boolean dispatch(CurrentActor actor,UUID job,boolean confirmed){
        admission.request(actor,job,confirmed);
        worker.recover();
        return dispatcher.dispatchTest(job);
    }
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public int plan(CurrentActor actor,boolean confirmed){
        admission.request(actor,null,confirmed);
        return planner.plan();
    }
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public void callback(byte[] raw,Map<String,String> headers){
        safety.requireTest();
        var received=clock.instant();
        // Authenticate and validate the entire bounded payload before processing any event.
        var verified=verifier.verify(raw,headers,received);
        for(var event:verified)events.apply(event,received);
    }
}
