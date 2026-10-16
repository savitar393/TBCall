package id.tbcall.application.reminder;

import org.springframework.stereotype.Component;

@Component
public class ReminderTransports {
    private final ReminderProperties properties;private final SimulatedWhatsAppTransport whatsapp;
    private final DisabledReminderTransport disabled;
    public ReminderTransports(ReminderProperties properties,SimulatedWhatsAppTransport whatsapp,DisabledReminderTransport disabled){this.properties=properties;this.whatsapp=whatsapp;this.disabled=disabled;}
    public boolean available(){return properties.getMode()==ReminderProperties.Mode.SIMULATED;}
    public ReminderTransport transport(String channel){
        if(!"WHATSAPP".equals(channel))throw new IllegalArgumentException("Unsupported reminder channel");
        return available()?whatsapp:disabled;
    }
}
