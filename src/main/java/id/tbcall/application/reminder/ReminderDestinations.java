package id.tbcall.application.reminder;

import java.util.Objects;
import org.springframework.stereotype.Component;
import static id.tbcall.application.reminder.ReminderStore.*;

/** Values live only at the authorized handoff; jobs retain only change detectors. */
@Component
public class ReminderDestinations {
    public record Destination(String value,String binding){@Override public String toString(){return "ReminderDestination[redacted]";}}
    private final TelegramLinkStore telegram;
    public ReminderDestinations(TelegramLinkStore telegram){this.telegram=telegram;}
    public Destination current(ReminderIdentity.Identity id,String channel,boolean lock){
        if(id==null)return null;
        return switch(channel){
            case "WHATSAPP"->id.verifiedPhone()?new Destination(id.phone(),id.phoneBinding()):null;
            case "EMAIL"->id.verifiedEmail()?new Destination(id.email(),id.emailBinding()):null;
            case "TELEGRAM"->{var d=telegram.current(id,lock);yield d==null?null:new Destination(d.value(),d.binding());}
            default->null;
        };
    }
    public boolean bound(Preference p,ReminderIdentity.Identity id,String channel){
        var d=current(id,channel,false);return linkBound(p,id) && d!=null && Objects.equals(p.binding(channel),d.binding());
    }
}
