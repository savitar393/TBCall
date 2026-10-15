package id.tbcall.application.reminder;

import java.util.UUID;

/** The destination exists only for this handoff; never log this message or store its body. */
public interface ReminderTransport {
    enum Outcome { ACCEPTED, SAFE_RETRY, SAFE_FALLBACK, FAILED, UNCERTAIN }
    record Result(Outcome outcome,String correlation){}
    record Message(UUID jobId,String idempotencyKey,String channel,String destination,String text){
        @Override public String toString(){return "ReminderMessage[jobId="+jobId+",channel="+channel+"]";}
    }
    Result send(Message message);
}
