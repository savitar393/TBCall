package id.tbcall.application.reminder;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.*;

public final class ReminderDtos {
    private ReminderDtos(){}
    public static final String POLICY="MEDICATION_REMINDERS_V1";
    public record Preferences(long version,boolean whatsappConsent,String timeZone,String permittedFrom,String permittedUntil,boolean allDay,
            boolean verifiedPhone,String maskedPhone,boolean bindingCurrent,String mode,String policyVersion,
            boolean emailConsent,boolean telegramConsent,boolean verifiedEmail,String maskedEmail,
            boolean emailBindingCurrent,boolean telegramBindingCurrent,boolean telegramLinked,String maskedTelegram,
            boolean emailAvailable,boolean telegramAvailable,@JsonIgnore String etag){}
    public record Change(@NotNull Boolean whatsappConsent,@Size(max=100) String timeZone,@Size(max=5) String permittedFrom,
            @Size(max=5) String permittedUntil,@NotNull Boolean allDay,@NotBlank String policyVersion,@NotNull Boolean riskAcknowledged,
            Boolean emailConsent,Boolean telegramConsent,Boolean emailRiskAcknowledged,Boolean telegramRiskAcknowledged){
        @JsonAnySetter public void unsupported(String field,Object value){throw new IllegalArgumentException("Unsupported reminder preference");}
    }
    public record HistoryItem(UUID id,OffsetDateTime scheduledAt,String channel,String state,int attemptCount,
            String classification,String mode,OffsetDateTime createdAt){}
    public record History(List<HistoryItem> content,int page,int size,long totalElements){}
}
