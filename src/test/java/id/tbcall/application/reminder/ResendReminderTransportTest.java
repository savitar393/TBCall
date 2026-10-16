package id.tbcall.application.reminder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ResendReminderTransportTest {
    final ChannelProviderProperties props=ChannelProviderPropertiesTest.email();
    final ChannelProviderHttp http=mock(ChannelProviderHttp.class);
    final ResendReminderTransport transport=new ResendReminderTransport(props,http);
    ReminderTransport.Message message(String channel,String to){return new ReminderTransport.Message(UUID.randomUUID(),"occurrence-test-key",channel,to,"private clinical information");}
    ReminderTransport.Message message(){return message("EMAIL","synthetic@example.invalid");}
    void respond(int status,String body)throws Exception{when(http.email(any(),anyString())).thenReturn(new ChannelProviderHttp.Response(status,body.getBytes(StandardCharsets.UTF_8)));}
    @Test void sendsOnlyFixedNeutralPayloadAndReturnsHashedAcceptance()throws Exception{
        when(http.email(any(),eq("occurrence-test-key"))).thenAnswer(call->{
            var json=new JsonMapper().readTree((byte[])call.getArgument(0));
            assertThat(json.size()).isEqualTo(4);assertThat(json.path("from").asString()).isEqualTo("TBCall Test <test@notify.umkmtumbuh.xyz>");
            assertThat(json.path("to").size()).isEqualTo(1);assertThat(json.path("to").get(0).asString()).isEqualTo("synthetic@example.invalid");
            assertThat(json.path("subject").asString()).isEqualTo("Pengingat jadwal Anda");
            assertThat(json.path("text").asString()).isEqualTo("Pengingat jadwal Anda. Silakan buka aplikasi TBCall untuk melihat informasi.");
            assertThat(json.toString()).doesNotContain("clinical","private","occurrence");
            return new ChannelProviderHttp.Response(200,"{\"id\":\"9bf7552f-67e8-4c64-8a9d-c1f3d6c48888\"}".getBytes(StandardCharsets.UTF_8));
        });
        var result=transport.send(message());assertThat(result.outcome()).isEqualTo(ReminderTransport.Outcome.ACCEPTED);
        assertThat(result.correlation()).matches("resend-[a-f0-9]{64}");assertThat(result.correlation()).doesNotContain("9bf7552f");
    }
    @ParameterizedTest @CsvSource({"429,rate_limit_exceeded,SAFE_RETRY","400,validation_error,FAILED","401,missing_api_key,FAILED","403,restricted_api_key,FAILED","422,validation_error,FAILED","409,invalid_idempotent_request,UNCERTAIN","500,application_error,UNCERTAIN","429,monthly_quota_exceeded,FAILED","400,unknown_error,UNCERTAIN"})
    void handlesOnlyDocumentedRejectionsConservatively(int status,String name,String expected)throws Exception{respond(status,"{\"statusCode\":"+status+",\"name\":\""+name+"\",\"message\":\"private provider value\"}");var result=transport.send(message());assertThat(result.outcome().name()).isEqualTo(expected);assertThat(result.correlation()).doesNotContain("private");}
    @ParameterizedTest @ValueSource(strings={"{}","null","invalid","{\"id\":\"bad\"}","{\"id\":\"9bf7552f-67e8-4c64-8a9d-c1f3d6c48888\",\"id\":\"9bf7552f-67e8-4c64-8a9d-c1f3d6c48888\"}","{\"id\":\"9bf7552f-67e8-4c64-8a9d-c1f3d6c48888\"} {}"})
    void malformedSuccessNeverPermitsRetry(String body)throws Exception{respond(200,body);assertThat(transport.send(message()).outcome()).isEqualTo(ReminderTransport.Outcome.UNCERTAIN);}
    @ParameterizedTest @ValueSource(strings={"WHATSAPP","TELEGRAM","email"}) void refusesOtherChannels(String channel){assertThatIllegalArgumentException().isThrownBy(()->transport.send(message(channel,"synthetic@example.invalid")));verifyNoInteractions(http);}
    @Test void rejectsUnallowlistedRecipientAndDisabledModeBeforeHttp(){assertThatIllegalArgumentException().isThrownBy(()->transport.send(message("EMAIL","other@example.invalid")));props.setEmailEnabled(false);assertThatIllegalStateException().isThrownBy(()->transport.send(message()));verifyNoInteractions(http);}
    @Test void networkFailureRemainsUncertainAndSanitized()throws Exception{when(http.email(any(),anyString())).thenThrow(new IOException("recipient or secret"));assertThat(transport.send(message())).isEqualTo(new ReminderTransport.Result(ReminderTransport.Outcome.UNCERTAIN,"resend-uncertain"));}
    @Test void interruptionIsPreserved()throws Exception{when(http.email(any(),anyString())).thenThrow(new InterruptedException("secret"));try{assertThat(transport.send(message()).outcome()).isEqualTo(ReminderTransport.Outcome.UNCERTAIN);assertThat(Thread.currentThread().isInterrupted()).isTrue();}finally{Thread.interrupted();}}
}
