package id.tbcall.application.reminder;

import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class MetaHttpClient {
    static final int MAX_RESPONSE_BYTES=16*1024;
    private static final int MAX_REQUEST_BYTES=4096;
    private final HttpClient http;
    public record Response(int status, byte[] body) {}
    @Autowired
    public MetaHttpClient() {
        this(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
            .version(HttpClient.Version.HTTP_1_1).proxy(ProxySelector.of(null))
            .connectTimeout(Duration.ofSeconds(5)).build());
    }
    MetaHttpClient(HttpClient http) {this.http=http;}

    /** One exchange only; timeout covers receipt of the complete bounded response body. */
    public Response post(URI uri, String bearer, byte[] json, int timeoutSeconds) throws IOException, InterruptedException {
        String retryAll=System.getProperty("jdk.httpclient.enableAllMethodRetry");
        if(retryAll != null && (retryAll.isEmpty() || Boolean.parseBoolean(retryAll))) {
            throw new IllegalStateException("Meta HTTP runtime must not enable non-idempotent retries");
        }
        if(uri == null || !"https".equals(uri.getScheme()) || !"graph.facebook.com".equals(uri.getHost())
                || uri.getPort() != -1 || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || !uri.getRawPath().matches("/v(?:23|24)\\.0/[1-9][0-9]{0,31}/messages")
                || bearer == null || !bearer.matches("[\\x21-\\x7e]{16,4096}") || json == null || json.length > MAX_REQUEST_BYTES
                || timeoutSeconds < 1 || timeoutSeconds > 8) throw new IllegalArgumentException("Invalid Meta HTTP request");
        HttpRequest request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(timeoutSeconds))
            .version(HttpClient.Version.HTTP_1_1)
            .header("Authorization","Bearer "+bearer).header("Content-Type","application/json")
            .POST(new SingleHandoffBody(json)).build();
        CompletableFuture<HttpResponse<byte[]>> pending=http.sendAsync(request,info->new BoundedBodySubscriber());
        try {
            var response=pending.get(timeoutSeconds,TimeUnit.SECONDS);
            return new Response(response.statusCode(),response.body());
        } catch(InterruptedException e) {
            pending.cancel(true); throw e;
        } catch(ExecutionException | TimeoutException e) {
            pending.cancel(true); throw new IOException("Meta HTTP exchange did not complete safely");
        }
    }

    /** Prevents body replay even if JDK retry settings were cached before admission. */
    private static final class SingleHandoffBody implements HttpRequest.BodyPublisher {
        private final HttpRequest.BodyPublisher body;
        private final AtomicBoolean subscribed=new AtomicBoolean();
        SingleHandoffBody(byte[] json){body=HttpRequest.BodyPublishers.ofByteArray(json);}
        @Override public long contentLength(){return body.contentLength();}
        @Override public void subscribe(Flow.Subscriber<? super ByteBuffer> subscriber) {
            if(subscribed.compareAndSet(false,true)) {
                body.subscribe(subscriber);
            } else {
                subscriber.onSubscribe(new Flow.Subscription(){
                    public void request(long count){}
                    public void cancel(){}
                });
                subscriber.onError(new IOException("Meta request body cannot be replayed"));
            }
        }
    }

    private static final class BoundedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result=new CompletableFuture<>();
        private final ByteArrayOutputStream buffer=new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody(){return result;}
        @Override public void onSubscribe(Flow.Subscription value) {
            if(subscription != null) {value.cancel();return;}
            subscription=value;
            result.whenComplete((ignored,failure)->{if(failure != null) value.cancel();});
            value.request(1);
        }
        @Override public void onNext(List<ByteBuffer> buffers) {
            if(result.isDone()) return;
            for(ByteBuffer bytes:buffers) {
                if(bytes.remaining() > MAX_RESPONSE_BYTES-buffer.size()) {
                    result.completeExceptionally(new IOException("Meta response exceeds permitted size"));
                    return;
                }
                byte[] part=new byte[bytes.remaining()]; bytes.get(part); buffer.writeBytes(part);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable failure){result.completeExceptionally(new IOException("Meta response unavailable"));}
        @Override public void onComplete(){result.complete(buffer.toByteArray());}
    }
}
