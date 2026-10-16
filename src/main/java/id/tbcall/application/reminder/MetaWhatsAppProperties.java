package id.tbcall.application.reminder;

import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties("tbcall.reminders.meta")
public class MetaWhatsAppProperties {
    private String businessAccountId="", testPhoneNumberId="", accessToken="", appSecret="", verifyToken="";
    private String graphVersion="v23.0", templateName="", templateLanguage="";
    private boolean testSenderConfirmed, templateApproved, syntheticEnvironment;
    private Set<String> allowedRecipients=Set.of();
    private int requestTimeoutSeconds=5, webhookMaxAgeHours=168;

    /** Startup admission for the isolated test mode; rechecked before every handoff. */
    public void validateForTest() {
        if (!testSenderConfirmed || !templateApproved || !syntheticEnvironment
                || !matches(businessAccountId,"[1-9][0-9]{0,31}")
                || !matches(testPhoneNumberId,"[1-9][0-9]{0,31}")
                || !secret(accessToken) || !secret(appSecret) || !secret(verifyToken)
                || !Set.of("v23.0","v24.0").contains(graphVersion == null ? "" : graphVersion)
                || !matches(templateName,"[a-z][a-z0-9_]{0,511}")
                || !matches(templateLanguage,"[a-z]{2,3}(?:_[A-Z]{2})?")
                || allowedRecipients == null || allowedRecipients.isEmpty() || allowedRecipients.size() > 5
                || allowedRecipients.stream().anyMatch(p->!matches(p,"\\+[1-9][0-9]{7,14}"))
                || requestTimeoutSeconds < 1 || requestTimeoutSeconds > 8
                || webhookMaxAgeHours < 1 || webhookMaxAgeHours > 168) {
            throw new IllegalStateException("Meta test messaging configuration is invalid or not approved");
        }
    }
    public boolean allows(String phone) {
        return matches(phone,"\\+[1-9][0-9]{7,14}") && allowedRecipients != null && allowedRecipients.contains(phone);
    }
    /** Operational correlation only: a phone digest is not anonymization. */
    public static String recipientDigest(String digits) {
        if (!matches(digits,"[1-9][0-9]{7,14}")) throw new IllegalArgumentException("Invalid Meta recipient");
        return ReminderIdentity.digest("whatsapp-recipient/"+digits);
    }
    private static boolean matches(String value,String pattern) { return value != null && value.matches(pattern); }
    private static boolean secret(String value) { return matches(value,"[\\x21-\\x7e]{16,4096}"); }
    public String getBusinessAccountId(){return businessAccountId;}
    public void setBusinessAccountId(String value){businessAccountId=value;}
    public String getTestPhoneNumberId(){return testPhoneNumberId;}
    public void setTestPhoneNumberId(String value){testPhoneNumberId=value;}
    public String getAccessToken(){return accessToken;}
    public void setAccessToken(String value){accessToken=value;}
    public String getAppSecret(){return appSecret;}
    public void setAppSecret(String value){appSecret=value;}
    public String getVerifyToken(){return verifyToken;}
    public void setVerifyToken(String value){verifyToken=value;}
    public String getGraphVersion(){return graphVersion;}
    public void setGraphVersion(String value){graphVersion=value;}
    public String getTemplateName(){return templateName;}
    public void setTemplateName(String value){templateName=value;}
    public String getTemplateLanguage(){return templateLanguage;}
    public void setTemplateLanguage(String value){templateLanguage=value;}
    public boolean isTestSenderConfirmed(){return testSenderConfirmed;}
    public void setTestSenderConfirmed(boolean value){testSenderConfirmed=value;}
    public boolean isTemplateApproved(){return templateApproved;}
    public void setTemplateApproved(boolean value){templateApproved=value;}
    public boolean isSyntheticEnvironment(){return syntheticEnvironment;}
    public void setSyntheticEnvironment(boolean value){syntheticEnvironment=value;}
    public Set<String> getAllowedRecipients(){return allowedRecipients;}
    public void setAllowedRecipients(Set<String> value){allowedRecipients=value;}
    public int getRequestTimeoutSeconds(){return requestTimeoutSeconds;}
    public void setRequestTimeoutSeconds(int value){requestTimeoutSeconds=value;}
    public int getWebhookMaxAgeHours(){return webhookMaxAgeHours;}
    public void setWebhookMaxAgeHours(int value){webhookMaxAgeHours=value;}
}
