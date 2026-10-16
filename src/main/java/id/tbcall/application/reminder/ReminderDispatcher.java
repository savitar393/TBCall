package id.tbcall.application.reminder;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class ReminderDispatcher {
    private final ReminderDispatchWorker worker;
    private final ReminderTransports transports;
    private final ReminderProperties properties;
    public ReminderDispatcher(ReminderDispatchWorker worker,ReminderTransports transports,ReminderProperties properties){this.worker=worker;this.transports=transports;this.properties=properties;}
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public int dispatch(){
        if(properties.getMode()==ReminderProperties.Mode.CLOUD_TEST)return 0;
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
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public boolean dispatchTest(UUID job){
        if(properties.getMode()!=ReminderProperties.Mode.CLOUD_TEST)throw new IllegalStateException("Explicit Meta test mode required");
        var claim=worker.claimOne(job);
        if(claim==null)return false;
        var handoff=worker.admit(claim);
        if(handoff==null)return false;
        ReminderTransport.Result result;
        try{result=transports.transport(handoff.message().channel()).send(handoff.message());}
        catch(RuntimeException ambiguous){result=new ReminderTransport.Result(ReminderTransport.Outcome.UNCERTAIN,null);}
        worker.complete(handoff,result);
        return true;
    }
}
