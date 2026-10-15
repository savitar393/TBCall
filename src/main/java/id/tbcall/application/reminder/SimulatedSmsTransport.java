package id.tbcall.application.reminder;

import org.springframework.stereotype.Component;

/** No network operations; acceptance is not delivery or medication evidence. */
@Component
public class SimulatedSmsTransport implements ReminderTransport {
    public Result send(Message message){return new Result(Outcome.ACCEPTED,"sim-"+message.idempotencyKey());}
}
