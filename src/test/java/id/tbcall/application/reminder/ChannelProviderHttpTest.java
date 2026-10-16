package id.tbcall.application.reminder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.Proxy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChannelProviderHttpTest {
    final ChannelProviderProperties props=ChannelProviderPropertiesTest.email();final HttpClient jdk=mock(HttpClient.class);
    final ChannelProviderHttp client=new ChannelProviderHttp(props,jdk);
    @Test void emailUsesOnlyFixedHttpsEndpointBearerAndDurableIdempotencyKey()throws Exception{
        when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{HttpRequest request=call.getArgument(0);
            assertThat(request.uri()).isEqualTo(URI.create("https://api.resend.com/emails"));assertThat(request.method()).isEqualTo("POST");
            assertThat(request.headers().firstValue("Authorization")).contains("Bearer re_dummy_credential_for_unit_test");assertThat(request.headers().firstValue("Idempotency-Key")).contains("occurrence-test-key");assertThat(request.headers().firstValue("Content-Type")).contains("application/json");assertThat(request.version()).contains(HttpClient.Version.HTTP_1_1);assertThat(request.timeout()).contains(Duration.ofSeconds(5));
            return completed(202,new byte[]{1,2});});
        var response=client.email(new byte[]{3},"occurrence-test-key");assertThat(response.status()).isEqualTo(202);assertThat(response.body()).containsExactly(1,2);verify(jdk,times(1)).sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
    }
    @ParameterizedTest @EnumSource(ChannelProviderHttp.Operation.class) void telegramUsesOnlyNamedOperationOnFixedHost(ChannelProviderHttp.Operation op)throws Exception{
        var p=ChannelProviderPropertiesTest.telegram();var telegram=new ChannelProviderHttp(p,jdk);
        String path=switch(op){case GET_ME->"getMe";case GET_WEBHOOK_INFO->"getWebhookInfo";case GET_UPDATES->"getUpdates";case SEND_MESSAGE->"sendMessage";};
        when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{HttpRequest request=call.getArgument(0);assertThat(request.uri()).isEqualTo(URI.create("https://api.telegram.org/bot123456789:dummy_unit_test_secret_123456789012345/"+path));assertThat(request.method()).isEqualTo("POST");assertThat(request.headers().firstValue("Authorization")).isEmpty();assertThat(request.headers().firstValue("Idempotency-Key")).isEmpty();return completed(200,new byte[0]);});
        telegram.telegram(op,new byte[]{1});
    }
    @Test void defaultClientDisablesRedirectsAndProxiesAndUsesHttp11(){try(var http=(HttpClient)ReflectionTestUtils.getField(new ChannelProviderHttp(props),"http")){assertThat(http.followRedirects()).isEqualTo(HttpClient.Redirect.NEVER);assertThat(http.version()).isEqualTo(HttpClient.Version.HTTP_1_1);assertThat(http.proxy().orElseThrow().select(URI.create("https://api.resend.com/emails"))).containsExactly(Proxy.NO_PROXY);}}
    @Test void singleHandoffBodyBlocksReplay()throws Exception{when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{HttpRequest req=call.getArgument(0);var publisher=req.bodyPublisher().orElseThrow();var first=new Capture();publisher.subscribe(first);assertThat(first.body.toByteArray()).containsExactly(7,8);assertThat(first.failure).isNull();var repeated=new Capture();publisher.subscribe(repeated);assertThat(repeated.body.size()).isZero();assertThat(repeated.failure).isInstanceOf(IOException.class);return completed(200,new byte[0]);});client.email(new byte[]{7,8},"key");}
    @Test void completeResponseTimeoutCancelsOneExchange(){props.setTimeoutSeconds(1);var pending=new CompletableFuture<HttpResponse<byte[]>>();when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn((CompletableFuture)pending);assertThatThrownBy(()->client.email(new byte[0],"key")).isInstanceOf(IOException.class).hasMessageNotContaining("credential");assertThat(pending.isCancelled()).isTrue();verify(jdk,times(1)).sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));}
    @Test void sendBodyIsBoundedBeforeAllocatingOversizedResponse()throws Exception{respondWithBody(16385);assertThatThrownBy(()->client.email(new byte[0],"key")).isInstanceOf(IOException.class);}
    @Test void pollingCanReadLargerBoundedUpdatesButStillRejectsOverflow()throws Exception{var p=ChannelProviderPropertiesTest.telegram();var telegram=new ChannelProviderHttp(p,jdk);respondWithBody(16385);assertThat(telegram.telegram(ChannelProviderHttp.Operation.GET_UPDATES,new byte[0]).body()).hasSize(16385);respondWithBody(262145);assertThatThrownBy(()->telegram.telegram(ChannelProviderHttp.Operation.GET_UPDATES,new byte[0])).isInstanceOf(IOException.class);}
    private void respondWithBody(int bytes){when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{HttpResponse.BodyHandler<byte[]> handler=call.getArgument(1);var subscriber=handler.apply(mock(HttpResponse.ResponseInfo.class));var subscription=mock(Flow.Subscription.class);subscriber.onSubscribe(subscription);subscriber.onNext(List.of(ByteBuffer.wrap(new byte[bytes])));subscriber.onComplete();return subscriber.getBody().toCompletableFuture().thenCompose(body->completed(200,body));});}
    @Test void invalidRequestsFailBeforeNetwork(){assertThatIllegalArgumentException().isThrownBy(()->client.email(new byte[4097],"key"));assertThatIllegalArgumentException().isThrownBy(()->client.email(new byte[0],"bad\r\nheader"));assertThatIllegalStateException().isThrownBy(()->client.telegram(ChannelProviderHttp.Operation.SEND_MESSAGE,new byte[0]));verifyNoInteractions(jdk);}
    @ParameterizedTest @ValueSource(strings={"true",""}) void unsafeJdkRetrySettingIsRejectedBeforeHttp(String value)throws Exception{
        String executable=System.getProperty("os.name").startsWith("Windows")?"java.exe":"java";
        var process=new ProcessBuilder(java.nio.file.Path.of(System.getProperty("java.home"),"bin",executable).toString(),"-Djdk.httpclient.enableAllMethodRetry="+value,"-cp",System.getProperty("java.class.path"),UnsafeRetryProbe.class.getName()).redirectErrorStream(true).start();
        try{assertThat(process.waitFor(15,java.util.concurrent.TimeUnit.SECONDS)).isTrue();assertThat(process.exitValue()).isZero();}finally{process.destroyForcibly();}
    }
    public static class UnsafeRetryProbe {public static void main(String[] args)throws Exception{var jdk=mock(HttpClient.class);try{new ChannelProviderHttp(ChannelProviderPropertiesTest.email(),jdk).email(new byte[0],"key");}catch(IllegalStateException expected){verifyNoInteractions(jdk);return;}catch(Throwable wrong){System.exit(3);}System.exit(4);}}
    static CompletableFuture<HttpResponse<byte[]>> completed(int status,byte[] body){HttpResponse<byte[]> response=mock(HttpResponse.class);when(response.statusCode()).thenReturn(status);when(response.body()).thenReturn(body);return CompletableFuture.completedFuture(response);}
    static class Capture implements Flow.Subscriber<ByteBuffer>{final ByteArrayOutputStream body=new ByteArrayOutputStream();Throwable failure;public void onSubscribe(Flow.Subscription sub){sub.request(Long.MAX_VALUE);}public void onNext(ByteBuffer buffer){byte[] bytes=new byte[buffer.remaining()];buffer.get(bytes);body.writeBytes(bytes);}public void onError(Throwable value){failure=value;}public void onComplete(){}}
}
