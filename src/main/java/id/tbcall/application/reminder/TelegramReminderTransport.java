package id.tbcall.application.reminder;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** sendMessage acceptance is not evidence of device delivery. */
@Component
public class TelegramReminderTransport implements ReminderTransport {
    private static final JsonMapper JSON=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private static final String TEXT="Pengingat jadwal Anda. Silakan buka aplikasi TBCall untuk melihat informasi.";
    private static final Set<Integer> DEFINITE_REJECTIONS=Set.of(400,401,403,404);
    private final ChannelProviderProperties properties;private final ChannelProviderHttp http;private final ReminderProperties reminders;
    public TelegramReminderTransport(ChannelProviderProperties properties,ChannelProviderHttp http,ReminderProperties reminders){this.properties=properties;this.http=http;this.reminders=reminders;}
    public Result send(Message message){
        properties.validateForTest();
        if(!properties.isTelegramEnabled())throw new IllegalStateException("Telegram test provider is disabled");
        if(message==null || !"TELEGRAM".equals(message.channel()) || !properties.telegramAllowed(message.destination()))throw new IllegalArgumentException("Telegram test messaging handoff is not permitted");
        byte[] body=JSON.writeValueAsBytes(Map.of("chat_id",message.destination(),"text",TEXT));
        try{return interpret(http.telegram(ChannelProviderHttp.Operation.SEND_MESSAGE,body),message.destination());}
        catch(InterruptedException e){Thread.currentThread().interrupt();return uncertain();}
        catch(IOException | RuntimeException e){return uncertain();}
    }
    private Result interpret(ChannelProviderHttp.Response response,String destination){
        if(response==null || response.body()==null || response.body().length>ChannelProviderHttp.MAX_SEND_RESPONSE_BYTES)return uncertain();
        JsonNode root=JSON.readTree(response.body());if(root==null || !root.isObject() || !root.path("ok").isBoolean())return uncertain();
        if(response.status()==200 && root.path("ok").asBoolean()){
            JsonNode result=root.path("result"),id=result.path("message_id"),chat=result.path("chat"),chatId=chat.path("id");
            if(root.has("error_code") || !result.isObject() || !id.isIntegralNumber() || !id.canConvertToInt() || id.asInt()<1
                || !chat.isObject() || !chatId.isIntegralNumber() || !chatId.canConvertToLong()
                || !destination.equals(Long.toString(chatId.asLong())) || !chat.path("type").isString() || !"private".equals(chat.path("type").asString()))return uncertain();
            return new Result(Outcome.ACCEPTED,"telegram-"+ReminderIdentity.digest(properties.botKey()+"/"+destination+"/"+id.asInt()));
        }
        if(response.status()<400 || response.status()>=500 || root.path("ok").asBoolean() || root.has("result"))return uncertain();
        JsonNode code=root.path("error_code"),description=root.path("description");
        if(!code.isIntegralNumber() || !code.canConvertToInt() || code.asInt()!=response.status() || !description.isString() || description.asString().isBlank() || description.asString().length()>4096)return uncertain();
        if(response.status()==429){
            JsonNode retry=root.path("parameters").path("retry_after");
            if(!retry.isIntegralNumber() || !retry.canConvertToInt() || retry.asInt()<1)return uncertain();
            // The first configured backoff is the shortest retry delay. A longer
            // provider flood wait cannot authorize an earlier dispatcher retry.
            return retry.asInt()<=reminders.getRetrySeconds()?new Result(Outcome.SAFE_RETRY,"telegram-throttled"):new Result(Outcome.FAILED,"telegram-throttled");
        }
        if(DEFINITE_REJECTIONS.contains(response.status()))return new Result(Outcome.FAILED,"telegram-rejected");
        return uncertain();
    }
    private static Result uncertain(){return new Result(Outcome.UNCERTAIN,"telegram-uncertain");}
}
