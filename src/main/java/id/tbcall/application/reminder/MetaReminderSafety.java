package id.tbcall.application.reminder;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

/** No startup probe, token introspection or external request is performed. */
@Component
public class MetaReminderSafety {
    private final ReminderProperties reminders;
    private final MetaWhatsAppProperties meta;
    public MetaReminderSafety(ReminderProperties reminders,MetaWhatsAppProperties meta){this.reminders=reminders;this.meta=meta;}
    @PostConstruct void validate(){
        if(reminders.getMode()==ReminderProperties.Mode.CLOUD_TEST){
            meta.validateForTest();
            if(reminders.getClaimSeconds()<=meta.getRequestTimeoutSeconds()+2)
                throw new IllegalStateException("Meta request timeout must fit inside the dispatch lease");
        }
    }
    public void requireTest(){
        if(reminders.getMode()!=ReminderProperties.Mode.CLOUD_TEST || reminders.isSchedulerEnabled())
            throw id.tbcall.application.common.ApplicationFailure.missing();
        validate();
    }
}
