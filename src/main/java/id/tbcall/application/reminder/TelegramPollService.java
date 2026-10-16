package id.tbcall.application.reminder;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** Operator-triggered test ingestion. The dedicated bot must have no other external consumer. */
@Service
public class TelegramPollService {
    private static final JsonMapper JSON=new JsonMapper();
    private final ChannelTestAdmission admission;private final ChannelProviderSafety safety;private final ChannelProviderProperties properties;private final ChannelProviderHttp http;private final TelegramPollWorker worker;private final Clock clock;
    public TelegramPollService(ChannelTestAdmission admission,ChannelProviderSafety safety,ChannelProviderProperties properties,ChannelProviderHttp http,TelegramPollWorker worker,Clock clock){this.admission=admission;this.safety=safety;this.properties=properties;this.http=http;this.worker=worker;this.clock=clock;}
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public int poll(CurrentActor actor,boolean confirmed){
        admission.request(actor,null,confirmed);safety.requireTest();
        if(!properties.isTelegramEnabled() || !properties.isTelegramExclusiveConsumerConfirmed())throw ApplicationFailure.forbidden();
        properties.validateForTest();TelegramPollWorker.Lease lease=worker.claim();if(lease==null)return 0;
        try{
            TelegramUpdateParser.verifyMe(exchange(ChannelProviderHttp.Operation.GET_ME,Map.of()),properties.getTelegramBotUsername(),properties.getTelegramBotToken());
            TelegramUpdateParser.verifyWebhook(exchange(ChannelProviderHttp.Operation.GET_WEBHOOK_INFO,Map.of()));
            if(lease.lastUpdateId()==Long.MAX_VALUE)throw ApplicationFailure.forbidden();
            byte[] body=exchange(ChannelProviderHttp.Operation.GET_UPDATES,Map.of("offset",lease.lastUpdateId()+1,"limit",100,"timeout",0,"allowed_updates",java.util.List.of("message")));
            var updates=TelegramUpdateParser.updates(body,properties.getTelegramBotUsername(),clock.instant());int count=0;
            for(var update:updates){if(!worker.apply(lease,update))break;count++;}
            return count;
        }catch(InterruptedException ex){Thread.currentThread().interrupt();throw unavailable();}
        catch(IOException | IllegalArgumentException ex){throw unavailable();}
        finally{worker.release(lease);}
    }
    private byte[] exchange(ChannelProviderHttp.Operation operation,Map<String,?> request)throws IOException,InterruptedException{
        final ChannelProviderHttp.Response response;
        try{response=http.telegram(operation,JSON.writeValueAsBytes(request));}
        catch(RuntimeException failure){throw unavailable();}
        if(response==null || response.status()!=200 || response.body()==null)throw unavailable();return response.body();
    }
    private ApplicationFailure unavailable(){return new ApplicationFailure(503,"TELEGRAM_POLL_UNAVAILABLE","Telegram belum dapat diperbarui","Periksa konfigurasi bot dan coba kembali melalui operator.");}
}
