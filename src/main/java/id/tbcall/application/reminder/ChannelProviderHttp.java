package id.tbcall.application.reminder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
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

/** Fixed provider endpoints, one handoff, bounded complete response, no redirects or proxy fallback. */
@Component
public class ChannelProviderHttp {
    static final int MAX_SEND_RESPONSE_BYTES=16*1024,MAX_POLL_RESPONSE_BYTES=256*1024;
    public enum Operation {
        GET_ME("getMe"),GET_WEBHOOK_INFO("getWebhookInfo"),GET_UPDATES("getUpdates"),SEND_MESSAGE("sendMessage");
        private final String path;Operation(String path){this.path=path;}
    }
    public record Response(int status,byte[] body){}
    private final ChannelProviderProperties properties;
    private final HttpClient http;
    @Autowired public ChannelProviderHttp(ChannelProviderProperties properties){this(properties,HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1)
        .proxy(ProxySelector.of(null)).connectTimeout(Duration.ofSeconds(5)).build());}
    ChannelProviderHttp(ChannelProviderProperties properties,HttpClient http){this.properties=properties;this.http=http;}
    public Response email(byte[] json,String idempotencyKey)throws IOException,InterruptedException {
        properties.validateForTest();
        if(!properties.isEmailEnabled())throw new IllegalStateException("Email test provider is disabled");
        if(idempotencyKey==null || !idempotencyKey.matches("[A-Za-z0-9/_:.-]{1,256}"))throw new IllegalArgumentException("Invalid provider request");
        return exchange(HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
            .header("Authorization","Bearer "+properties.getResendApiKey()).header("Idempotency-Key",idempotencyKey),json,MAX_SEND_RESPONSE_BYTES);
    }
    public Response telegram(Operation operation,byte[] json)throws IOException,InterruptedException {
        properties.validateForTest();
        if(!properties.isTelegramEnabled())throw new IllegalStateException("Telegram test provider is disabled");
        if(operation==null)throw new IllegalArgumentException("Invalid provider operation");
        return exchange(HttpRequest.newBuilder(URI.create("https://api.telegram.org/bot"+properties.getTelegramBotToken()+"/"+operation.path)),json,
            operation==Operation.GET_UPDATES?MAX_POLL_RESPONSE_BYTES:MAX_SEND_RESPONSE_BYTES);
    }
    private Response exchange(HttpRequest.Builder builder,byte[] json,int maxResponse)throws IOException,InterruptedException {
        String retryAll=System.getProperty("jdk.httpclient.enableAllMethodRetry");
        if(retryAll!=null && (retryAll.isEmpty() || Boolean.parseBoolean(retryAll)))throw new IllegalStateException("Provider HTTP runtime must not enable non-idempotent retries");
        if(json==null || json.length>4096)throw new IllegalArgumentException("Invalid provider request");
        int timeout=properties.getTimeoutSeconds();
        HttpRequest request=builder.timeout(Duration.ofSeconds(timeout)).version(HttpClient.Version.HTTP_1_1)
            .header("Content-Type","application/json").POST(new SingleHandoffBody(json)).build();
        CompletableFuture<HttpResponse<byte[]>> pending=http.sendAsync(request,info->new BoundedBodySubscriber(maxResponse));
        try {var response=pending.get(timeout,TimeUnit.SECONDS);return new Response(response.statusCode(),response.body());}
        catch(InterruptedException e){pending.cancel(true);throw e;}
        catch(ExecutionException | TimeoutException e){pending.cancel(true);throw new IOException("Provider HTTP exchange did not complete safely");}
    }
    private static final class SingleHandoffBody implements HttpRequest.BodyPublisher {
        private final HttpRequest.BodyPublisher body;private final AtomicBoolean subscribed=new AtomicBoolean();
        SingleHandoffBody(byte[] json){body=HttpRequest.BodyPublishers.ofByteArray(json);}
        public long contentLength(){return body.contentLength();}
        public void subscribe(Flow.Subscriber<? super ByteBuffer> subscriber){
            if(subscribed.compareAndSet(false,true)){body.subscribe(subscriber);return;}
            subscriber.onSubscribe(new Flow.Subscription(){public void request(long count){}public void cancel(){}});
            subscriber.onError(new IOException("Provider request body cannot be replayed"));
        }
    }
    private static final class BoundedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final int max;private final CompletableFuture<byte[]> result=new CompletableFuture<>();
        private final ByteArrayOutputStream buffer=new ByteArrayOutputStream();private Flow.Subscription subscription;
        BoundedBodySubscriber(int max){this.max=max;}
        public CompletionStage<byte[]> getBody(){return result;}
        public void onSubscribe(Flow.Subscription value){if(subscription!=null){value.cancel();return;}subscription=value;result.whenComplete((ignored,failure)->{if(failure!=null)value.cancel();});value.request(1);}
        public void onNext(List<ByteBuffer> buffers){if(result.isDone())return;for(ByteBuffer bytes:buffers){if(bytes.remaining()>max-buffer.size()){result.completeExceptionally(new IOException("Provider response exceeds permitted size"));return;}byte[] part=new byte[bytes.remaining()];bytes.get(part);buffer.writeBytes(part);}subscription.request(1);}
        public void onError(Throwable failure){result.completeExceptionally(new IOException("Provider response unavailable"));}
        public void onComplete(){result.complete(buffer.toByteArray());}
    }
}
