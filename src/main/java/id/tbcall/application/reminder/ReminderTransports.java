package id.tbcall.application.reminder;

import org.springframework.stereotype.Component;

@Component
public class ReminderTransports {
    private final ReminderProperties properties;private final SimulatedWhatsAppTransport whatsapp;
    private final SimulatedSmsTransport sms;private final DisabledReminderTransport disabled;
    public ReminderTransports(ReminderProperties properties,SimulatedWhatsAppTransport whatsapp,SimulatedSmsTransport sms,DisabledReminderTransport disabled){this.properties=properties;this.whatsapp=whatsapp;this.sms=sms;this.disabled=disabled;}
    public boolean available(){return properties.getMode()==ReminderProperties.Mode.SIMULATED;}
    public ReminderTransport transport(String channel){return !available()?disabled:"WHATSAPP".equals(channel)?whatsapp:sms;}
}
