package id.tbcall.application.reminder;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class MetaWhatsAppTransport implements ReminderTransport {
    private static final JsonMapper JSON = JsonMapper.builder()
        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    // Documented rejection classes (credentials, permissions, recipient and template validation).
    // Any unknown error remains uncertain and cannot authorize another handoff.
    private static final Set<Integer> DEFINITE_REJECTIONS = Set.of(10,100,190,200,131005,131008,
        131009,131021,131026,131030,132000,132001,132005,132007,132012,132015,132016,133010);
    private final MetaWhatsAppProperties properties;
    private final MetaHttpClient http;

    public MetaWhatsAppTransport(MetaWhatsAppProperties properties,MetaHttpClient http) {
        this.properties=properties; this.http=http;
    }

    public Result send(Message message) {
        properties.validateForTest();
        if(message == null || !"WHATSAPP".equals(message.channel())
                || !properties.allows(message.destination()) || message.callbackToken() == null) {
            throw new IllegalArgumentException("Meta test messaging handoff is not permitted");
        }
        String digits=message.destination().substring(1);
        // No text, idempotency key, patient data, template components or personalization.
        byte[] body=JSON.writeValueAsBytes(Map.of("messaging_product","whatsapp","recipient_type","individual",
            "to",digits,"type","template","template",Map.of("name",properties.getTemplateName(),
                "language",Map.of("code",properties.getTemplateLanguage())),
            "biz_opaque_callback_data",message.callbackToken().toString()));
        URI uri=URI.create("https://graph.facebook.com/"+properties.getGraphVersion()+"/"
            +properties.getTestPhoneNumberId()+"/messages");
        try {
            return interpret(http.post(uri,properties.getAccessToken(),body,properties.getRequestTimeoutSeconds()),digits);
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt(); return uncertain();
        } catch(IOException | RuntimeException e) {
            // Provider payloads and low-level exceptions may contain contact data or credentials.
            return uncertain();
        }
    }

    private Result interpret(MetaHttpClient.Response response,String digits) {
        if(response == null || response.body() == null || response.body().length > MetaHttpClient.MAX_RESPONSE_BYTES) return uncertain();
        JsonNode root=JSON.readTree(response.body());
        if(root == null || !root.isObject()) return uncertain();
        if(response.status() == 200) {
            if(root.has("error") || !textEquals(root.path("messaging_product"),"whatsapp")) return uncertain();
            JsonNode messages=root.path("messages");
            if(!messages.isArray() || messages.size() != 1 || !messages.get(0).isObject()) return uncertain();
            JsonNode sent=messages.get(0), id=sent.path("id");
            if(!id.isString() || !id.asString().matches("wamid\\.[A-Za-z0-9_+/=\\-]{1,506}")) return uncertain();
            if(sent.has("message_status") && !textEquals(sent.path("message_status"),"accepted")) return uncertain();
            if(root.has("contacts")) {
                JsonNode contacts=root.path("contacts");
                if(!contacts.isArray() || contacts.size() != 1 || !contacts.get(0).isObject()
                        || !textEquals(contacts.get(0).path("input"),digits)
                        || !textEquals(contacts.get(0).path("wa_id"),digits)) return uncertain();
            }
            return new Result(Outcome.ACCEPTED,"meta-"+ReminderIdentity.digest(id.asString()));
        }
        if(response.status() < 400 || response.status() >= 500 || response.status() == 408 || response.status() == 409
                || root.has("messages")) return uncertain();
        JsonNode error=root.path("error"),code=error.path("code");
        if(!error.isObject() || !code.isIntegralNumber() || !code.canConvertToInt()
                || !boundedText(error.path("type"),128) || !boundedText(error.path("message"),4096)) return uncertain();
        if(response.status() == 429 && code.asInt() == 130429) return new Result(Outcome.SAFE_RETRY,"meta-throttled");
        if(response.status() != 429 && DEFINITE_REJECTIONS.contains(code.asInt())) return new Result(Outcome.FAILED,"meta-rejected");
        return uncertain();
    }
    private static boolean textEquals(JsonNode node,String expected) {return node.isString() && expected.equals(node.asString());}
    private static boolean boundedText(JsonNode node,int max) {return node.isString() && !node.asString().isBlank() && node.asString().length() <= max;}
    private static Result uncertain(){return new Result(Outcome.UNCERTAIN,"meta-uncertain");}
}
