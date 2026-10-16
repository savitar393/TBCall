package id.tbcall.application.reminder;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Resend acceptance only; no inbox delivery claim or retry after ambiguous handoff. */
@Component
public class ResendReminderTransport implements ReminderTransport {
    private static final JsonMapper JSON=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private static final String TEXT="Pengingat jadwal Anda. Silakan buka aplikasi TBCall untuk melihat informasi.";
    private static final Map<String,Set<Integer>> REJECTIONS=Map.ofEntries(
        Map.entry("invalid_idempotency_key",Set.of(400)),Map.entry("validation_error",Set.of(400,401,403,422)),
        Map.entry("missing_api_key",Set.of(401)),Map.entry("restricted_api_key",Set.of(401,403)),
        Map.entry("invalid_permission",Set.of(403)),Map.entry("suspended_api_key",Set.of(403)),
        Map.entry("not_found",Set.of(404)),Map.entry("method_not_allowed",Set.of(405)),
        Map.entry("invalid_attachment",Set.of(422)),Map.entry("invalid_parameter",Set.of(422)),
        Map.entry("missing_required_field",Set.of(422)),Map.entry("missing_required_parameter",Set.of(422)),
        Map.entry("daily_quota_exceeded",Set.of(429)),Map.entry("monthly_quota_exceeded",Set.of(429)));
    private final ChannelProviderProperties properties;private final ChannelProviderHttp http;
    public ResendReminderTransport(ChannelProviderProperties properties,ChannelProviderHttp http){this.properties=properties;this.http=http;}
    public Result send(Message message){
        properties.validateForTest();
        if(!properties.isEmailEnabled())throw new IllegalStateException("Email test provider is disabled");
        if(message==null || !"EMAIL".equals(message.channel()) || !properties.emailAllowed(message.destination())
            || message.idempotencyKey()==null || !message.idempotencyKey().matches("[A-Za-z0-9/_:.-]{1,256}"))throw new IllegalArgumentException("Email test messaging handoff is not permitted");
        byte[] body=JSON.writeValueAsBytes(Map.of("from",properties.getEmailFrom(),"to",List.of(message.destination()),
            "subject","Pengingat jadwal Anda","text",TEXT));
        try{return interpret(http.email(body,message.idempotencyKey()));}
        catch(InterruptedException e){Thread.currentThread().interrupt();return uncertain();}
        catch(IOException | RuntimeException e){return uncertain();}
    }
    private Result interpret(ChannelProviderHttp.Response response){
        if(response==null || response.body()==null || response.body().length>ChannelProviderHttp.MAX_SEND_RESPONSE_BYTES)return uncertain();
        JsonNode root=JSON.readTree(response.body());if(root==null || !root.isObject())return uncertain();
        if(response.status()==200){
            JsonNode id=root.path("id");
            if(root.has("error") || root.has("name") || !id.isString() || !id.asString().matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))return uncertain();
            return new Result(Outcome.ACCEPTED,"resend-"+ReminderIdentity.digest(id.asString()));
        }
        if(response.status()<400 || response.status()>=500 || response.status()==408 || response.status()==409 || root.has("id"))return uncertain();
        JsonNode name=root.path("name"),message=root.path("message");
        if(!name.isString() || !message.isString() || message.asString().isBlank() || message.asString().length()>4096)return uncertain();
        if(root.has("statusCode") && (!root.path("statusCode").isIntegralNumber() || !root.path("statusCode").canConvertToInt() || root.path("statusCode").asInt()!=response.status()))return uncertain();
        if(response.status()==429 && "rate_limit_exceeded".equals(name.asString()))return new Result(Outcome.SAFE_RETRY,"resend-throttled");
        if(REJECTIONS.getOrDefault(name.asString(),Set.of()).contains(response.status()))return new Result(Outcome.FAILED,"resend-rejected");
        return uncertain();
    }
    private static Result uncertain(){return new Result(Outcome.UNCERTAIN,"resend-uncertain");}
}
