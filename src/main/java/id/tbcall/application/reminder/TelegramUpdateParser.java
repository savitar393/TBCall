package id.tbcall.application.reminder;

import java.time.Instant;
import java.util.*;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;

/** Strict bounded provider replies. Unsupported updates retain only their update number. */
public final class TelegramUpdateParser {
    private TelegramUpdateParser(){}
    static final long START_MAX_AGE_SECONDS=300,STOP_MAX_AGE_SECONDS=24*60*60;
    private static final JsonMapper JSON=JsonMapper.builder(JsonFactory.builder()
        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).disable(StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION)
        .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(24).maxStringLength(16384).maxNameLength(128).maxNumberLength(32).build()).build())
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    public enum Command { START,STOP,IGNORE }
    public record Update(long updateId,Command command,String chat,String tokenDigest,Instant occurredAt){
        @Override public String toString(){return "TelegramUpdate[id="+updateId+",command="+command+",content=redacted]";}
    }
    public static void verifyMe(byte[] body,String username,String token){
        JsonNode result=result(body);String publicId=token==null?"":token.split(":",2)[0];
        if(!result.isObject() || !result.path("is_bot").isBoolean() || !result.path("is_bot").booleanValue()
                || !username.equals(text(result,"username")) || !publicId.equals(positiveId(result.path("id"))))throw invalid();
    }
    public static void verifyWebhook(byte[] body){JsonNode result=result(body);if(!result.isObject() || !"".equals(text(result,"url")))throw invalid();}
    public static List<Update> updates(byte[] body,String username,Instant now){
        JsonNode result=result(body);if(!result.isArray() || result.size()>100)throw invalid();
        List<Update> updates=new ArrayList<>();long previous=-1;
        for(JsonNode value:result){
            JsonNode number=value.path("update_id");if(!value.isObject() || !number.isIntegralNumber() || !number.canConvertToLong() || number.longValue()<0 || number.longValue()<=previous)throw invalid();
            previous=number.longValue();updates.add(parse(previous,value.path("message"),username,now));
        }
        return List.copyOf(updates);
    }
    private static Update parse(long id,JsonNode message,String username,Instant now){
        Update ignored=new Update(id,Command.IGNORE,null,null,null);
        if(!message.isObject() || message.has("sender_chat") || message.has("via_bot") || message.has("forward_origin") || message.has("forward_from") || message.has("forward_from_chat"))return ignored;
        JsonNode chat=message.path("chat"),from=message.path("from"),date=message.path("date");
        String chatId=positiveId(chat.path("id"));
        if(!"private".equals(text(chat,"type")) || chatId==null || !chatId.equals(positiveId(from.path("id")))
                || !from.path("is_bot").isBoolean() || from.path("is_bot").booleanValue()
                || !date.isIntegralNumber() || !date.canConvertToLong() || date.longValue()<0)return ignored;
        Instant occurred;
        try{occurred=Instant.ofEpochSecond(date.longValue());}catch(RuntimeException ex){return ignored;}
        String text=text(message,"text");if(text==null)return ignored;
        boolean stop=text.equals("/stop") || text.equals("/stop@"+username);
        long maxAge=stop?STOP_MAX_AGE_SECONDS:START_MAX_AGE_SECONDS;
        if(now==null || occurred.isBefore(now.minusSeconds(maxAge)) || occurred.isAfter(now.plusSeconds(300)))return ignored;
        if(stop)return new Update(id,Command.STOP,chatId,null,occurred);
        for(String prefix:List.of("/start ","/start@"+username+" ")){
            if(text.startsWith(prefix)){
                String nonce=text.substring(prefix.length());
                if(nonce.matches("[A-Za-z0-9_-]{43}"))return new Update(id,Command.START,chatId,ReminderIdentity.digest(nonce),occurred);
            }
        }
        return ignored;
    }
    private static JsonNode result(byte[] body){
        if(body==null || body.length>262144)throw invalid();
        try{JsonNode root=JSON.readTree(body);if(root==null || !root.isObject() || !root.path("ok").isBoolean() || !root.path("ok").booleanValue() || !root.has("result"))throw invalid();return root.path("result");}
        catch(RuntimeException ex){throw invalid();}
    }
    private static String text(JsonNode node,String field){JsonNode value=node.path(field);return value.isString()?value.stringValue():null;}
    private static String positiveId(JsonNode node){return node.isIntegralNumber() && node.canConvertToLong() && node.longValue()>0 && Long.toString(node.longValue()).matches("[1-9][0-9]{0,15}")?Long.toString(node.longValue()):null;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Telegram response rejected");}
}
