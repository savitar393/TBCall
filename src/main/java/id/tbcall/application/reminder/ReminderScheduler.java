package id.tbcall.application.reminder;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;

@Component @EnableScheduling
@ConditionalOnProperty(name="tbcall.reminders.scheduler-enabled",havingValue="true")
public class ReminderScheduler {
    private final ReminderPlanner planner;
    private final ReminderDispatcher dispatcher;
    public ReminderScheduler(ReminderPlanner planner,ReminderDispatcher dispatcher){this.planner=planner;this.dispatcher=dispatcher;}
    @Scheduled(fixedDelayString="${tbcall.reminders.interval-ms:15000}")
    public void tick(){planner.plan();dispatcher.dispatch();}
}
