package id.tbcall.application.reminder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import id.tbcall.security.SecurityProperties;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TelegramReminderTransportTest {
    final ChannelProviderProperties props=ChannelProviderPropertiesTest.telegram();final ChannelProviderHttp http=mock(ChannelProviderHttp.class);
    final TelegramReminderTransport transport=new TelegramReminderTransport(props,http,new ReminderProperties(new SecurityProperties(),new MockEnvironment()));
    ReminderTransport.Message message(){return new ReminderTransport.Message(UUID.randomUUID(),"key","TELEGRAM","123456789","private clinical information");}
    void respond(int status,String body)throws Exception{when(http.telegram(eq(ChannelProviderHttp.Operation.SEND_MESSAGE),any())).thenReturn(new ChannelProviderHttp.Response(status,body.getBytes(StandardCharsets.UTF_8)));}
    @Test void sendsFixedPlainTextToExactPrivateDestinationAndHashesAcceptance()throws Exception{
        when(http.telegram(eq(ChannelProviderHttp.Operation.SEND_MESSAGE),any())).thenAnswer(call->{var json=new JsonMapper().readTree((byte[])call.getArgument(1));assertThat(json.size()).isEqualTo(2);assertThat(json.path("chat_id").asString()).isEqualTo("123456789");assertThat(json.path("text").asString()).isEqualTo("Pengingat jadwal Anda. Silakan buka aplikasi TBCall untuk melihat informasi.");assertThat(json.toString()).doesNotContain("clinical","private","parse_mode");return new ChannelProviderHttp.Response(200,"{\"ok\":true,\"result\":{\"message_id\":12,\"date\":1700000000,\"chat\":{\"id\":123456789,\"type\":\"private\"},\"text\":\"neutral\"}}".getBytes(StandardCharsets.UTF_8));});
        var result=transport.send(message());assertThat(result.outcome()).isEqualTo(ReminderTransport.Outcome.ACCEPTED);assertThat(result.correlation()).matches("telegram-[a-f0-9]{64}");assertThat(result.correlation()).doesNotContain("123456789");
    }
    @ParameterizedTest @ValueSource(ints={1,15}) void respectsRateLimitWithinExistingDelay(int retry)throws Exception{respond(429,"{\"ok\":false,\"error_code\":429,\"description\":\"Too Many Requests\",\"parameters\":{\"retry_after\":"+retry+"}}");assertThat(transport.send(message()).outcome()).isEqualTo(ReminderTransport.Outcome.SAFE_RETRY);}
    @Test void longerRetryDelayCannotAuthorizeEarlyResend()throws Exception{respond(429,"{\"ok\":false,\"error_code\":429,\"description\":\"Too Many Requests\",\"parameters\":{\"retry_after\":16}}");assertThat(transport.send(message()).outcome()).isEqualTo(ReminderTransport.Outcome.FAILED);}
    @Test void configuredShortRetryDelayCannotResendBeforeProviderWait()throws Exception{
        respond(429,"{\"ok\":false,\"error_code\":429,\"description\":\"Too Many Requests\",\"parameters\":{\"retry_after\":15}}");
        assertThat(configuredTransport(1).send(message()).outcome()).isEqualTo(ReminderTransport.Outcome.FAILED);
    }
    @Test void configuredLongerRetryDelayMayRespectProviderWait()throws Exception{
        respond(429,"{\"ok\":false,\"error_code\":429,\"description\":\"Too Many Requests\",\"parameters\":{\"retry_after\":30}}");
        assertThat(configuredTransport(60).send(message()).outcome()).isEqualTo(ReminderTransport.Outcome.SAFE_RETRY);
    }
    private TelegramReminderTransport configuredTransport(int delay){
        try(var context=new AnnotationConfigApplicationContext()){
            context.registerBean(ReminderProperties.class,()->{var p=new ReminderProperties(new SecurityProperties(),new MockEnvironment());p.setRetrySeconds(delay);return p;});
            context.registerBean(ChannelProviderProperties.class,()->props);context.registerBean(ChannelProviderHttp.class,()->http);
            context.registerBean(TelegramReminderTransport.class);context.refresh();return context.getBean(TelegramReminderTransport.class);
        }
    }
    @ParameterizedTest @ValueSource(ints={400,401,403,404}) void structuredKnownRejectionFails(int status)throws Exception{respond(status,"{\"ok\":false,\"error_code\":"+status+",\"description\":\"private error\"}");assertThat(transport.send(message())).isEqualTo(new ReminderTransport.Result(ReminderTransport.Outcome.FAILED,"telegram-rejected"));}
    @ParameterizedTest @ValueSource(strings={"{}","null","invalid","{\"ok\":true,\"result\":{\"message_id\":0,\"chat\":{\"id\":123456789,\"type\":\"private\"}}}","{\"ok\":true,\"result\":{\"message_id\":12,\"chat\":{\"id\":123456788,\"type\":\"private\"}}}","{\"ok\":true,\"result\":{\"message_id\":12,\"chat\":{\"id\":123456789,\"type\":\"group\"}}}","{\"ok\":true,\"ok\":true}","{\"ok\":true} {}"})
    void malformedAcceptanceRemainsUncertain(String body)throws Exception{respond(200,body);assertThat(transport.send(message()).outcome()).isEqualTo(ReminderTransport.Outcome.UNCERTAIN);}
    @ParameterizedTest @ValueSource(ints={408,409,429,500,503}) void ambiguousFailuresNeverAuthorizeRetry(int status)throws Exception{respond(status,"{\"ok\":false,\"error_code\":"+status+",\"description\":\"private error\"}");assertThat(transport.send(message()).outcome()).isEqualTo(ReminderTransport.Outcome.UNCERTAIN);}
    @Test void disabledProviderRejectedBeforeHttp(){props.setTelegramEnabled(false);assertThatIllegalStateException().isThrownBy(()->transport.send(message()));verifyNoInteractions(http);}
    @Test void unallowlistedAndOtherChannelCannotReachHttp(){assertThatIllegalArgumentException().isThrownBy(()->transport.send(new ReminderTransport.Message(UUID.randomUUID(),"key","TELEGRAM","123456788","text")));assertThatIllegalArgumentException().isThrownBy(()->transport.send(new ReminderTransport.Message(UUID.randomUUID(),"key","EMAIL","123456789","text")));verifyNoInteractions(http);}
    @Test void ioFailureRemainsUncertainAndSanitized()throws Exception{when(http.telegram(any(),any())).thenThrow(new IOException("secret token"));assertThat(transport.send(message())).isEqualTo(new ReminderTransport.Result(ReminderTransport.Outcome.UNCERTAIN,"telegram-uncertain"));}
}
