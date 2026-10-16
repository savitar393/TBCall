package id.tbcall.application.reminder;

import id.tbcall.application.common.ApplicationFailure;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

@Component
public class ChannelProviderSafety {
    private final ReminderProperties reminders;private final ChannelProviderProperties providers;
    public ChannelProviderSafety(ReminderProperties reminders,ChannelProviderProperties providers){this.reminders=reminders;this.providers=providers;}
    @PostConstruct void validate(){if(reminders.getMode()==ReminderProperties.Mode.CHANNEL_TEST){
        providers.validateForTest();
        if(reminders.isSchedulerEnabled() || reminders.getClaimSeconds()<=providers.getTimeoutSeconds()+2)
            throw new IllegalStateException("Channel tests require manual dispatch and a bounded handoff lease");
    }}
    public void requireTest(){if(reminders.getMode()!=ReminderProperties.Mode.CHANNEL_TEST)throw ApplicationFailure.missing();validate();}
}
