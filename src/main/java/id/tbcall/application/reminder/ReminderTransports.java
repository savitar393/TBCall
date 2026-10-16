package id.tbcall.application.reminder;

import org.springframework.stereotype.Component;

@Component
public class ReminderTransports {
    private final ReminderProperties properties;private final SimulatedWhatsAppTransport whatsapp;
    private final DisabledReminderTransport disabled;
    private final MetaWhatsAppTransport meta;
    private final ChannelProviderProperties channels;private final ResendReminderTransport email;private final TelegramReminderTransport telegram;
    public ReminderTransports(ReminderProperties properties,SimulatedWhatsAppTransport whatsapp,DisabledReminderTransport disabled,MetaWhatsAppTransport meta,ChannelProviderProperties channels,ResendReminderTransport email,TelegramReminderTransport telegram){this.properties=properties;this.whatsapp=whatsapp;this.disabled=disabled;this.meta=meta;this.channels=channels;this.email=email;this.telegram=telegram;}
    public boolean available(){return available("WHATSAPP") || available("EMAIL") || available("TELEGRAM");}
    public boolean available(String channel){return switch(channel){
        case "WHATSAPP"->properties.getMode()==ReminderProperties.Mode.SIMULATED || properties.getMode()==ReminderProperties.Mode.CLOUD_TEST;
        case "EMAIL"->properties.getMode()==ReminderProperties.Mode.CHANNEL_TEST && channels.isEmailEnabled();
        case "TELEGRAM"->properties.getMode()==ReminderProperties.Mode.CHANNEL_TEST && channels.isTelegramEnabled();
        default->false;};}
    public ReminderTransport transport(String channel){
        if(!java.util.Set.of("WHATSAPP","EMAIL","TELEGRAM").contains(channel==null?"":channel))throw new IllegalArgumentException("Unsupported reminder channel");
        if(!available(channel))return disabled;
        if("EMAIL".equals(channel))return email;
        if("TELEGRAM".equals(channel))return telegram;
        return switch(properties.getMode()){
            case DISABLED -> disabled;
            case SIMULATED -> whatsapp;
            case CLOUD_TEST -> meta;
            case CHANNEL_TEST -> disabled;
        };
    }
}
