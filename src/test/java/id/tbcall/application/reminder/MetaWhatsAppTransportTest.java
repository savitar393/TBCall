package id.tbcall.application.reminder;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MetaWhatsAppTransportTest {
    private final MetaWhatsAppProperties properties = MetaWhatsAppPropertiesTest.configured();
    private final MetaHttpClient http = mock(MetaHttpClient.class);
    private final MetaWhatsAppTransport transport = new MetaWhatsAppTransport(properties, http);
    private final UUID callback = UUID.fromString("7ae9ece3-fcd2-44ea-8afb-6659a3a3349e");

    private ReminderTransport.Message message(String channel, String recipient) {
        return new ReminderTransport.Message(UUID.randomUUID(), "private-idempotency-value", channel,
            recipient, "private clinical text must never leave", callback);
    }
    private void respond(int status, String json) throws Exception {
        when(http.post(any(),anyString(),any(),anyInt()))
            .thenReturn(new MetaHttpClient.Response(status,json.getBytes(StandardCharsets.UTF_8)));
    }
    private String accepted() { return """
        {"messaging_product":"whatsapp","contacts":[{"input":"15555550123","wa_id":"15555550123"}],
         "messages":[{"id":"wamid.ABC_123==","message_status":"accepted"}]}
        """; }

    @Test void sendsOnlyApprovedNeutralTemplateToFixedMetaEndpointAndHashesProviderCorrelation() throws Exception {
        var captured = new AtomicReference<JsonNode>();
        when(http.post(eq(URI.create("https://graph.facebook.com/v23.0/987654321012345/messages")),
                eq(properties.getAccessToken()),any(),eq(5))).thenAnswer(call->{
            captured.set(new JsonMapper().readTree((byte[]) call.getArgument(2)));
            return new MetaHttpClient.Response(200,accepted().getBytes(StandardCharsets.UTF_8));
        });
        var result = transport.send(message("WHATSAPP","+15555550123"));
        assertThat(result.outcome()).isEqualTo(ReminderTransport.Outcome.ACCEPTED);
        assertThat(result.correlation()).isEqualTo("meta-"+ReminderIdentity.digest("wamid.ABC_123=="));
        var body = captured.get();
        assertThat(body.path("messaging_product").asString()).isEqualTo("whatsapp");
        assertThat(body.path("recipient_type").asString()).isEqualTo("individual");
        assertThat(body.path("to").asString()).isEqualTo("15555550123");
        assertThat(body.path("type").asString()).isEqualTo("template");
        assertThat(body.path("template").path("name").asString()).isEqualTo("neutral_test_reminder");
        assertThat(body.path("template").path("language").path("code").asString()).isEqualTo("en_US");
        assertThat(body.path("biz_opaque_callback_data").asString()).isEqualTo(callback.toString());
        assertThat(body.size()).isEqualTo(6);
        assertThat(body.path("template").size()).isEqualTo(2);
        assertThat(body.toString()).doesNotContain("private", "clinical", "components", "parameters");
    }

    @ParameterizedTest @ValueSource(strings={"SMS","EMAIL","whatsapp",""})
    void refusesUnsupportedChannelBeforeHttp(String channel) {
        assertThatIllegalArgumentException().isThrownBy(()->transport.send(message(channel,"+15555550123")));
        verifyNoInteractions(http);
    }
    @ParameterizedTest @ValueSource(strings={"+15555550124","15555550123"," +15555550123","+15555550123\n"})
    void refusesNonAllowlistedDestinationBeforeHttp(String recipient) {
        assertThatIllegalArgumentException().isThrownBy(()->transport.send(message("WHATSAPP",recipient)));
        verifyNoInteractions(http);
    }
    @Test void revalidatesGatesImmediatelyBeforeHttp() {
        properties.setSyntheticEnvironment(false);
        assertThatIllegalStateException().isThrownBy(()->transport.send(message("WHATSAPP","+15555550123")));
        verifyNoInteractions(http);
    }
    @Test void requiresOpaqueCallbackTokenBeforeHttp() {
        assertThatIllegalArgumentException().isThrownBy(()->transport.send(new ReminderTransport.Message(
            UUID.randomUUID(),"key","WHATSAPP","+15555550123","text")));
        verifyNoInteractions(http);
    }

    @ParameterizedTest @ValueSource(strings={"{}","not-json","null",
        "{\"messaging_product\":\"sms\",\"messages\":[{\"id\":\"wamid.ABC\"}]}",
        "{\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"wamid.ABC\"},{\"id\":\"wamid.DEF\"}]}",
        "{\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"untrusted-id\"}]}",
        "{\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"wamid.ABC\",\"message_status\":\"held_for_quality_assessment\"}]}",
        "{\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"wamid.ABC\",\"message_status\":\"other\"}]}",
        "{\"messaging_product\":\"whatsapp\",\"contacts\":[{\"input\":\"15555550123\",\"wa_id\":\"15555550124\"}],\"messages\":[{\"id\":\"wamid.ABC\"}]}",
        "{\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"wamid.ABC\"}]} {}",
        "{\"messaging_product\":\"whatsapp\",\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"wamid.ABC\"}]}"})
    void uncertainSuccessBodiesNeverAuthorizeRetry(String body) throws Exception {
        respond(200,body);
        assertThat(transport.send(message("WHATSAPP","+15555550123")).outcome())
            .isEqualTo(ReminderTransport.Outcome.UNCERTAIN);
    }
    @Test void acceptsValidMinimalProviderAcceptanceWithoutContactsOrOptionalMessageStatus() throws Exception {
        respond(200,"{\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"wamid.ABC\"}]}");
        assertThat(transport.send(message("WHATSAPP","+15555550123")).outcome()).isEqualTo(ReminderTransport.Outcome.ACCEPTED);
    }
    @Test void oversizedBodiesCannotBeAccepted() throws Exception {
        respond(200," ".repeat(16385)+accepted());
        assertThat(transport.send(message("WHATSAPP","+15555550123")).outcome()).isEqualTo(ReminderTransport.Outcome.UNCERTAIN);
    }
    @Test void confirmedRateLimitIsTheOnlySafeRetry() throws Exception {
        respond(429,"{\"error\":{\"message\":\"private provider text\",\"type\":\"OAuthException\",\"code\":130429,\"fbtrace_id\":\"private-trace\"}}");
        var result = transport.send(message("WHATSAPP","+15555550123"));
        assertThat(result.outcome()).isEqualTo(ReminderTransport.Outcome.SAFE_RETRY);
        assertThat(result.correlation()).doesNotContain("private", "15555550123");
    }
    @ParameterizedTest @ValueSource(ints={400,401,403,404})
    void definitiveStructuredClientErrorsFailWithoutLeakingProviderText(int status) throws Exception {
        respond(status,"{\"error\":{\"message\":\"private provider text\",\"type\":\"OAuthException\",\"code\":190,\"fbtrace_id\":\"private-trace\"}}");
        var result = transport.send(message("WHATSAPP","+15555550123"));
        assertThat(result.outcome()).isEqualTo(ReminderTransport.Outcome.FAILED);
        assertThat(result.correlation()).doesNotContain("private", "15555550123");
    }
    @ParameterizedTest @ValueSource(ints={201,302,408,409,429,500,503})
    void ambiguousStatusesAndBodiesRemainUncertain(int status) throws Exception {
        respond(status,accepted());
        assertThat(transport.send(message("WHATSAPP","+15555550123")).outcome()).isEqualTo(ReminderTransport.Outcome.UNCERTAIN);
    }
    @Test void ioFailuresAreUncertainAndSanitized() throws Exception {
        when(http.post(any(),anyString(),any(),anyInt())).thenThrow(new IOException("private phone +15555550123"));
        var result = transport.send(message("WHATSAPP","+15555550123"));
        assertThat(result.outcome()).isEqualTo(ReminderTransport.Outcome.UNCERTAIN);
        assertThat(result.correlation()).doesNotContain("private","15555550123");
    }
    @Test void interruptionPreservesInterruptAndNeverAuthorizesRetry() throws Exception {
        when(http.post(any(),anyString(),any(),anyInt())).thenThrow(new InterruptedException("private"));
        try {
            assertThat(transport.send(message("WHATSAPP","+15555550123")).outcome()).isEqualTo(ReminderTransport.Outcome.UNCERTAIN);
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally { Thread.interrupted(); }
    }
}
