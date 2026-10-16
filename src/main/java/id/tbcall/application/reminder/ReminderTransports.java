package id.tbcall.application.reminder;

import org.springframework.stereotype.Component;

@Component
public class ReminderTransports {
    private final ReminderProperties properties;private final SimulatedWhatsAppTransport whatsapp;
    private final DisabledReminderTransport disabled;
    private final MetaWhatsAppTransport meta;
    public ReminderTransports(ReminderProperties properties,SimulatedWhatsAppTransport whatsapp,DisabledReminderTransport disabled,MetaWhatsAppTransport meta){this.properties=properties;this.whatsapp=whatsapp;this.disabled=disabled;this.meta=meta;}
    public boolean available(){return properties.getMode()==ReminderProperties.Mode.SIMULATED || properties.getMode()==ReminderProperties.Mode.CLOUD_TEST;}
    public ReminderTransport transport(String channel){
        if(!"WHATSAPP".equals(channel))throw new IllegalArgumentException("Unsupported reminder channel");
        return switch(properties.getMode()){
            case DISABLED -> disabled;
            case SIMULATED -> whatsapp;
            case CLOUD_TEST -> meta;
        };
    }
}
