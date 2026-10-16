package id.tbcall.application.reminder;

import java.io.IOException;
import java.net.URI;
import java.net.Proxy;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MetaHttpClientTest {
    private final HttpClient jdk = mock(HttpClient.class);
    private final MetaHttpClient client = new MetaHttpClient(jdk);
    private final URI endpoint = URI.create("https://graph.facebook.com/v23.0/987654321012345/messages");

    @Test void requestUsesBearerJsonAndFixedTimeoutWithoutRetry() throws Exception {
        when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{
            HttpRequest request = call.getArgument(0);
            assertThat(request.uri()).isEqualTo(endpoint);
            assertThat(request.method()).isEqualTo("POST");
            assertThat(request.version()).contains(HttpClient.Version.HTTP_1_1);
            assertThat(request.headers().firstValue("Authorization")).contains("Bearer dummy-test-bearer");
            assertThat(request.headers().firstValue("Content-Type")).contains("application/json");
            assertThat(request.timeout()).contains(java.time.Duration.ofSeconds(2));
            HttpResponse<byte[]> response = mock(HttpResponse.class);
            when(response.statusCode()).thenReturn(200);
            when(response.body()).thenReturn(new byte[]{1,2});
            return CompletableFuture.completedFuture(response);
        });
        var result = client.post(endpoint,"dummy-test-bearer",new byte[]{3},2);
        assertThat(result.status()).isEqualTo(200);
        assertThat(result.body()).containsExactly(1,2);
        verify(jdk,times(1)).sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
    }

    @Test void boundedBodySubscriberCancelsOnOverflowBeforeAllocatingFullBody() throws Exception {
        when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{
            HttpResponse.BodyHandler<byte[]> handler = call.getArgument(1);
            var info = mock(HttpResponse.ResponseInfo.class);
            var subscriber = handler.apply(info);
            var subscription = mock(Flow.Subscription.class);
            subscriber.onSubscribe(subscription);
            subscriber.onNext(List.of(ByteBuffer.wrap(new byte[16384])));
            subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{1})));
            assertThat(subscriber.getBody().toCompletableFuture()).isCompletedExceptionally();
            verify(subscription).cancel();
            return subscriber.getBody().toCompletableFuture().thenApply(body-> {
                HttpResponse<byte[]> response = mock(HttpResponse.class);
                when(response.body()).thenReturn(body);
                return response;
            });
        });
        assertThatThrownBy(()->client.post(endpoint,"dummy-test-bearer",new byte[]{3},1))
            .isInstanceOf(IOException.class).hasMessageNotContaining("dummy-test");
    }

    @Test void deadlineIncludesResponseBodyAndCancelsPendingExchange() {
        var pending = new CompletableFuture<HttpResponse<byte[]>>();
        when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn((CompletableFuture)pending);
        assertThatThrownBy(()->client.post(endpoint,"dummy-test-bearer",new byte[]{3},1)).isInstanceOf(IOException.class);
        assertThat(pending.isCancelled()).isTrue();
        verify(jdk,times(1)).sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
    }

    @Test void subscriberCollectsBoundedBodyInOrder() throws Exception {
        when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{
            HttpResponse.BodyHandler<byte[]> handler = call.getArgument(1);
            var subscriber = handler.apply(mock(HttpResponse.ResponseInfo.class));
            subscriber.onSubscribe(mock(Flow.Subscription.class));
            subscriber.onNext(List.of(ByteBuffer.wrap(new byte[]{1,2}),ByteBuffer.wrap(new byte[]{3})));
            subscriber.onComplete();
            HttpResponse<byte[]> response = mock(HttpResponse.class);
            when(response.statusCode()).thenReturn(200);
            when(response.body()).thenReturn(subscriber.getBody().toCompletableFuture().join());
            return CompletableFuture.completedFuture(response);
        });
        assertThat(client.post(endpoint,"dummy-test-bearer",new byte[]{3},1).body()).containsExactly(1,2,3);
    }

    @Test void unsafeEndpointCannotReachHttp() {
        assertThatIllegalArgumentException().isThrownBy(()->client.post(URI.create("https://elsewhere.invalid/messages"),"dummy-test-bearer",new byte[0],1));
        verifyNoInteractions(jdk);
    }

    @Test void oversizedRequestCannotReachHttp() {
        assertThatIllegalArgumentException().isThrownBy(()->client.post(endpoint,"dummy-test-bearer",new byte[4097],1));
        verifyNoInteractions(jdk);
    }

    @Test void defaultClientUsesDirectHttp11WithoutProxyOrRedirectFallback() {
        // Inspect the actual client configuration without starting any exchange.
        try (var configured = (HttpClient) ReflectionTestUtils.getField(new MetaHttpClient(),"http")) {
            assertThat(configured.version()).isEqualTo(HttpClient.Version.HTTP_1_1);
            assertThat(configured.followRedirects()).isEqualTo(HttpClient.Redirect.NEVER);
            assertThat(configured.proxy()).isPresent();
            assertThat(configured.proxy().orElseThrow().select(endpoint)).containsExactly(Proxy.NO_PROXY);
        }
    }

    @Test void requestBodyCannotBeReplayedEvenIfTheJdkAttemptsAnotherSubscription() throws Exception {
        when(jdk.sendAsync(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{
            HttpRequest request=call.getArgument(0);
            HttpRequest.BodyPublisher publisher=request.bodyPublisher().orElseThrow();
            var first=new BodyCapture();
            publisher.subscribe(first);
            assertThat(first.body.toByteArray()).containsExactly(7,8,9);
            assertThat(first.failure).isNull();
            var replay=new BodyCapture();
            publisher.subscribe(replay);
            assertThat(replay.body.size()).isZero();
            assertThat(replay.failure).isInstanceOf(IOException.class);
            HttpResponse<byte[]> response=mock(HttpResponse.class);
            when(response.statusCode()).thenReturn(200);
            when(response.body()).thenReturn(new byte[0]);
            return CompletableFuture.completedFuture(response);
        });
        client.post(endpoint,"dummy-test-bearer",new byte[]{7,8,9},1);
    }

    private static class BodyCapture implements Flow.Subscriber<ByteBuffer> {
        final java.io.ByteArrayOutputStream body=new java.io.ByteArrayOutputStream();
        Throwable failure;
        public void onSubscribe(Flow.Subscription subscription){subscription.request(Long.MAX_VALUE);}
        public void onNext(ByteBuffer item){byte[] bytes=new byte[item.remaining()];item.get(bytes);body.writeBytes(bytes);}
        public void onError(Throwable value){failure=value;}
        public void onComplete(){}
    }

    @ParameterizedTest @ValueSource(strings={"true",""})
    void processSettingsThatEnablePostRetryAreRejectedBeforeHttp(String value) throws Exception {
        // A child JVM gives the real launch-time property while preserving this test JVM's settings.
        String executable=System.getProperty("os.name").startsWith("Windows")?"java.exe":"java";
        var process = new ProcessBuilder(java.nio.file.Path.of(System.getProperty("java.home"),"bin",executable).toString(),
            "-Djdk.httpclient.enableAllMethodRetry="+value,"-cp",System.getProperty("java.class.path"),
            UnsafeRetryProbe.class.getName()).redirectErrorStream(true).start();
        try {
            assertThat(process.waitFor(15,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThat(process.exitValue()).isZero();
        } finally { process.destroyForcibly(); }
    }

    public static class UnsafeRetryProbe {
        public static void main(String[] args) throws Exception {
            HttpClient mockHttp=mock(HttpClient.class);
            try {
                new MetaHttpClient(mockHttp).post(URI.create("https://graph.facebook.com/v23.0/987654321012345/messages"),
                    "dummy-test-bearer",new byte[0],1);
            } catch (IllegalStateException expected) {
                verifyNoInteractions(mockHttp);
                return;
            } catch (Throwable unexpected) {
                System.exit(3);
            }
            System.exit(4);
        }
    }
}
