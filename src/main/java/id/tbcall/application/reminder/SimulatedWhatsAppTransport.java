package id.tbcall.application.reminder;

import org.springframework.stereotype.Component;

/** In-process acceptance simulation only: no client, URI, socket, callback, or delivery claim. */
@Component
public class SimulatedWhatsAppTransport implements ReminderTransport {
    public Result send(Message message){return new Result(Outcome.ACCEPTED,"sim-"+message.idempotencyKey());}
}
