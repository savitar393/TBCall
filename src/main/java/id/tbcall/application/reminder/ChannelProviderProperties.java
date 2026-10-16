package id.tbcall.application.reminder;

import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Explicit admission for the isolated synthetic email/Telegram provider mode. */
@Component
@ConfigurationProperties("tbcall.reminders.channels")
public class ChannelProviderProperties {
    private boolean emailEnabled,telegramEnabled,syntheticEnvironment,telegramExclusiveConsumerConfirmed;
    private String resendApiKey="",emailFrom="TBCall Test <test@notify.umkmtumbuh.xyz>";
    private String telegramBotToken="",telegramBotUsername="";
    private Set<String> emailRecipients=Set.of(),telegramRecipients=Set.of();
    private int timeoutSeconds=5;

    public void validateForTest() {
        if(!syntheticEnvironment || (!emailEnabled && !telegramEnabled) || timeoutSeconds<1 || timeoutSeconds>8
                || (emailEnabled && (!matches(resendApiKey,"re_[A-Za-z0-9_-]{10,4093}") || !validFrom(emailFrom)
                    || !validRecipients(emailRecipients,true)))
                || (telegramEnabled && (!telegramExclusiveConsumerConfirmed || !validBot()
                    || !validRecipients(telegramRecipients,false)))) {
            throw new IllegalStateException("Channel test messaging configuration is invalid or not approved");
        }
    }
    private static boolean validRecipients(Set<String> values,boolean email) {
        return values!=null && !values.isEmpty() && values.size()<=5
            && values.stream().allMatch(v->email?canonicalExactEmail(v):privateChat(v));
    }
    public boolean emailAllowed(String value){return canonicalExactEmail(value) && emailRecipients!=null && emailRecipients.contains(value);}
    public boolean telegramAllowed(String value){return privateChat(value) && telegramRecipients!=null && telegramRecipients.contains(value);}
    /** Canonical account identity only; callers must still obtain it from verified server identity. */
    public static String canonicalEmail(String value) {
        if(value==null)return null;
        String email=value.trim().toLowerCase(Locale.ROOT);
        if(email.length()>254 || !email.matches("[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+")
                || email.indexOf('@')>64)return null;
        return email;
    }
    private static boolean canonicalExactEmail(String value){return value!=null && value.equals(canonicalEmail(value));}
    private static boolean validFrom(String value) {
        if(value==null || value.length()>254)return false;
        if(canonicalExactEmail(value))return true;
        int start=value.indexOf(" <");
        return start>0 && value.endsWith(">") && matches(value.substring(0,start),"[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}")
            && canonicalExactEmail(value.substring(start+2,value.length()-1));
    }
    private static boolean privateChat(String value){
        if(!matches(value,"[1-9][0-9]{0,15}"))return false;
        try{return Long.parseLong(value)<=4503599627370495L;}catch(NumberFormatException e){return false;}
    }
    private boolean validBot(){return matches(telegramBotToken,"[1-9][0-9]{0,15}:[A-Za-z0-9_-]{30,128}")
        && matches(telegramBotUsername,"[A-Za-z0-9_]{5,32}") && telegramBotUsername.toLowerCase(Locale.ROOT).endsWith("bot");}
    /** Public bot identity survives credential rotation; the secret is never hashed into persistence. */
    public String botKey(){if(!validBot())throw new IllegalStateException("Telegram bot identity is invalid");return ReminderIdentity.digest("telegram-bot/"+telegramBotUsername.toLowerCase(Locale.ROOT)+"/"+telegramBotToken.substring(0,telegramBotToken.indexOf(':')));}
    private static boolean matches(String value,String regex){return value!=null && value.matches(regex);}
    public boolean isEmailEnabled(){return emailEnabled;} public void setEmailEnabled(boolean value){emailEnabled=value;}
    public boolean isTelegramEnabled(){return telegramEnabled;} public void setTelegramEnabled(boolean value){telegramEnabled=value;}
    public boolean isSyntheticEnvironment(){return syntheticEnvironment;} public void setSyntheticEnvironment(boolean value){syntheticEnvironment=value;}
    public boolean isTelegramExclusiveConsumerConfirmed(){return telegramExclusiveConsumerConfirmed;} public void setTelegramExclusiveConsumerConfirmed(boolean value){telegramExclusiveConsumerConfirmed=value;}
    public String getResendApiKey(){return resendApiKey;} public void setResendApiKey(String value){resendApiKey=value;}
    public String getEmailFrom(){return emailFrom;} public void setEmailFrom(String value){emailFrom=value;}
    public Set<String> getEmailRecipients(){return emailRecipients;} public void setEmailRecipients(Set<String> value){emailRecipients=value;}
    public String getTelegramBotToken(){return telegramBotToken;} public void setTelegramBotToken(String value){telegramBotToken=value;}
    public String getTelegramBotUsername(){return telegramBotUsername;} public void setTelegramBotUsername(String value){telegramBotUsername=value;}
    public Set<String> getTelegramRecipients(){return telegramRecipients;} public void setTelegramRecipients(Set<String> value){telegramRecipients=value;}
    public int getTimeoutSeconds(){return timeoutSeconds;} public void setTimeoutSeconds(int value){timeoutSeconds=value;}
}
