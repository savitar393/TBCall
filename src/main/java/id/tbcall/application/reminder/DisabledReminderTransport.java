package id.tbcall.application.reminder;

import org.springframework.stereotype.Component;

/** Production boundary: deliberately cannot deliver a message. */
@Component
public class DisabledReminderTransport implements ReminderTransport {
    public Result send(Message message){return new Result(Outcome.FAILED,null);}
}
