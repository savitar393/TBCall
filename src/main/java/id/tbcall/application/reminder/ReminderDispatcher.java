package id.tbcall.application.reminder;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class ReminderDispatcher {
    private final ReminderDispatchWorker worker;
    private final ReminderTransports transports;
    public ReminderDispatcher(ReminderDispatchWorker worker,ReminderTransports transports){this.worker=worker;this.transports=transports;}
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public int dispatch(){
        worker.recover();
        int dispatched=0;
        for(var claim:worker.claim()){
            var handoff=worker.admit(claim);
            if(handoff==null)continue;
            ReminderTransport.Result result;
            try{result=transports.transport(handoff.message().channel()).send(handoff.message());}
            catch(RuntimeException ambiguous){result=new ReminderTransport.Result(ReminderTransport.Outcome.UNCERTAIN,null);}
            // Persistence errors propagate; an admitted handoff is recovered as UNCERTAIN, never replayed.
            worker.complete(handoff,result);
            dispatched++;
        }
        return dispatched;
    }
}
