package id.tbcall.application.reminder;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class TelegramUpdateParserTest {
    private final Instant now=Instant.parse("2026-10-16T01:00:00Z");
    private final String token="A".repeat(43);
    private byte[] json(String message){return ("{\"ok\":true,\"result\":[{\"update_id\":5,"+message+"}]}").getBytes(StandardCharsets.UTF_8);}
    private String message(String text){return "\"message\":{\"date\":"+now.getEpochSecond()+",\"chat\":{\"id\":12345,\"type\":\"private\"},\"from\":{\"id\":12345,\"is_bot\":false},\"text\":\""+text+"\"}";}
    @Test void extractsOnlyExactPrivateStartAndRetainsOnlyNonceDigest(){
        var event=TelegramUpdateParser.updates(json(message("/start@test_bot "+token)),"test_bot",now).getFirst();
        assertThat(event.updateId()).isEqualTo(5);assertThat(event.command()).isEqualTo(TelegramUpdateParser.Command.START);
        assertThat(event.tokenDigest()).isEqualTo(ReminderIdentity.digest(token));assertThat(event.chat()).isEqualTo("12345");
        assertThat(event.toString()).doesNotContain(token,"12345");
    }
    @ParameterizedTest @ValueSource(strings={"/start@foreign_bot "," /start ","/START ","/start  ","/start "})
    void ignoresMalformedOrForeignStart(String prefix){
        String raw=prefix.equals("/start ")?prefix+token+" extra":prefix+token;
        assertThat(TelegramUpdateParser.updates(json(message(raw)),"test_bot",now).getFirst().command()).isEqualTo(TelegramUpdateParser.Command.IGNORE);
    }
    @ParameterizedTest @ValueSource(strings={"group","channel","supergroup"})
    void ignoresNonPrivateChats(String type){
        assertThat(TelegramUpdateParser.updates(json(message("/start "+token).replace("private",type)),"test_bot",now).getFirst().command()).isEqualTo(TelegramUpdateParser.Command.IGNORE);
    }
    @Test void ignoresBotsMismatchedSenderAndOldMessages(){
        for(String raw:new String[]{message("/stop").replace("false","true"),message("/stop").replace("\"from\":{\"id\":12345","\"from\":{\"id\":12346"),message("/stop").replace(Long.toString(now.getEpochSecond()),Long.toString(now.minusSeconds(86401).getEpochSecond()))})
            assertThat(TelegramUpdateParser.updates(json(raw),"test_bot",now).getFirst().command()).isEqualTo(TelegramUpdateParser.Command.IGNORE);
    }
    @Test void acceptsQueuedStopForOneDayWhileStartStillExpiresAfterFiveMinutes(){
        String delayed=message("/stop").replace(Long.toString(now.getEpochSecond()),Long.toString(now.minusSeconds(600).getEpochSecond()));
        assertThat(TelegramUpdateParser.updates(json(delayed),"test_bot",now).getFirst().command()).isEqualTo(TelegramUpdateParser.Command.STOP);
        String oldStart=message("/start "+token).replace(Long.toString(now.getEpochSecond()),Long.toString(now.minusSeconds(600).getEpochSecond()));
        assertThat(TelegramUpdateParser.updates(json(oldStart),"test_bot",now).getFirst().command()).isEqualTo(TelegramUpdateParser.Command.IGNORE);
        String future=message("/stop").replace(Long.toString(now.getEpochSecond()),Long.toString(now.plusSeconds(301).getEpochSecond()));
        assertThat(TelegramUpdateParser.updates(json(future),"test_bot",now).getFirst().command()).isEqualTo(TelegramUpdateParser.Command.IGNORE);
    }
    @Test void acknowledgesUnknownUpdatesWithoutKeepingTheirContents(){
        var value=TelegramUpdateParser.updates(json("\"edited_message\":{\"text\":\"secret\"}"),"test_bot",now).getFirst();
        assertThat(value.command()).isEqualTo(TelegramUpdateParser.Command.IGNORE);assertThat(value.chat()).isNull();
    }
    @Test void rejectsDuplicateKeysTrailingJsonOversizedAndUnorderedBatches(){
        for(String raw:new String[]{"{\"ok\":true,\"ok\":false,\"result\":[]}","{\"ok\":true,\"result\":[]} {}","{\"ok\":true,\"result\":[{\"update_id\":2},{\"update_id\":1}]}"," ".repeat(262145)})
            assertThatIllegalArgumentException().isThrownBy(()->TelegramUpdateParser.updates(raw.getBytes(StandardCharsets.UTF_8),"test_bot",now));
    }
    @Test void refusesForeignBotAndExistingWebhook(){
        TelegramUpdateParser.verifyMe("{\"ok\":true,\"result\":{\"id\":123,\"is_bot\":true,\"username\":\"test_bot\"}}".getBytes(StandardCharsets.UTF_8),"test_bot","123:placeholder");
        assertThatIllegalArgumentException().isThrownBy(()->TelegramUpdateParser.verifyMe("{\"ok\":true,\"result\":{\"id\":124,\"is_bot\":true,\"username\":\"test_bot\"}}".getBytes(StandardCharsets.UTF_8),"test_bot","123:placeholder"));
        assertThatIllegalArgumentException().isThrownBy(()->TelegramUpdateParser.verifyWebhook("{\"ok\":true,\"result\":{\"url\":\"https://example.invalid\"}}".getBytes(StandardCharsets.UTF_8)));
    }
}
