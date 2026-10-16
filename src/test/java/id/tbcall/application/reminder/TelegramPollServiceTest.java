package id.tbcall.application.reminder;

import id.tbcall.authorization.CurrentActor;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class TelegramPollServiceTest {
    final ChannelTestAdmission admission=mock(ChannelTestAdmission.class);final ChannelProviderSafety safety=mock(ChannelProviderSafety.class);
    final ChannelProviderProperties props=mock(ChannelProviderProperties.class);final ChannelProviderHttp http=mock(ChannelProviderHttp.class);final TelegramPollWorker worker=mock(TelegramPollWorker.class);
    final CurrentActor actor=mock(CurrentActor.class);final TelegramPollWorker.Lease lease=new TelegramPollWorker.Lease("b".repeat(64),UUID.randomUUID(),9);
    final TelegramPollService service=new TelegramPollService(admission,safety,props,http,worker,Clock.fixed(Instant.parse("2026-10-16T01:00:00Z"),ZoneOffset.UTC));
    private ChannelProviderHttp.Response ok(String raw){return new ChannelProviderHttp.Response(200,raw.getBytes(StandardCharsets.UTF_8));}
    private void setup() throws Exception {
        when(props.isTelegramEnabled()).thenReturn(true);when(props.isTelegramExclusiveConsumerConfirmed()).thenReturn(true);when(props.getTelegramBotUsername()).thenReturn("test_bot");when(props.getTelegramBotToken()).thenReturn("123:placeholder");when(worker.claim()).thenReturn(lease);
        when(http.telegram(eq(ChannelProviderHttp.Operation.GET_ME),any())).thenReturn(ok("{\"ok\":true,\"result\":{\"id\":123,\"is_bot\":true,\"username\":\"test_bot\"}}"));
        when(http.telegram(eq(ChannelProviderHttp.Operation.GET_WEBHOOK_INFO),any())).thenReturn(ok("{\"ok\":true,\"result\":{\"url\":\"\"}}"));
        when(http.telegram(eq(ChannelProviderHttp.Operation.GET_UPDATES),any())).thenReturn(ok("{\"ok\":true,\"result\":[{\"update_id\":10},{\"update_id\":11}]}"));
    }
    @Test void admitsBeforeHttpAndAdvancesOnlyCommittedUpdatesWithShortPolling() throws Exception {
        setup();when(worker.apply(eq(lease),any())).thenReturn(true,false);assertThat(service.poll(actor,true)).isEqualTo(1);
        var order=inOrder(admission,safety,worker,http);order.verify(admission).request(actor,null,true);order.verify(safety).requireTest();order.verify(worker).claim();order.verify(http).telegram(eq(ChannelProviderHttp.Operation.GET_ME),any());order.verify(http).telegram(eq(ChannelProviderHttp.Operation.GET_WEBHOOK_INFO),any());
        var body=org.mockito.ArgumentCaptor.forClass(byte[].class);verify(http).telegram(eq(ChannelProviderHttp.Operation.GET_UPDATES),body.capture());
        var json=new tools.jackson.databind.json.JsonMapper().readTree(body.getValue());assertThat(json.path("offset").asLong()).isEqualTo(10);assertThat(json.path("timeout").asInt()).isZero();assertThat(json.path("limit").asInt()).isEqualTo(100);
        verify(worker).release(lease);verifyNoMoreInteractions(http);
    }
    @Test void webhookOrWrongBotRefusesUpdatesAndReleasesLease() throws Exception {
        setup();when(http.telegram(eq(ChannelProviderHttp.Operation.GET_WEBHOOK_INFO),any())).thenReturn(ok("{\"ok\":true,\"result\":{\"url\":\"https://example.invalid\"}}"));
        assertThatThrownBy(()->service.poll(actor,true)).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
        verify(http,never()).telegram(eq(ChannelProviderHttp.Operation.GET_UPDATES),any());verify(worker).release(lease);verify(worker,never()).apply(any(),any());
    }
    @Test void sanitizesRuntimeFailuresFromHttpWithoutRetainingProviderUriOrCause() throws Exception {
        setup();when(http.telegram(eq(ChannelProviderHttp.Operation.GET_ME),any())).thenThrow(new IllegalStateException("https://api.telegram.org/bot123:DUMMY_PRIVATE_TEST_VALUE/getMe"));
        var error=catchThrowable(()->service.poll(actor,true));
        assertThat(error).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class).hasNoCause().hasMessageNotContaining("DUMMY_PRIVATE_TEST_VALUE").hasMessageNotContaining("api.telegram.org");
        verify(worker).release(lease);verify(worker,never()).apply(any(),any());
    }
    @Test void preservesDatabaseFailuresRatherThanMaskingThemAsProviderFailures() throws Exception {
        setup();var failure=new org.springframework.dao.DataAccessResourceFailureException("Database unavailable");when(worker.apply(eq(lease),any())).thenThrow(failure);
        assertThat(catchThrowable(()->service.poll(actor,true))).isSameAs(failure);verify(worker).release(lease);
    }
    @Test void requiresExplicitExclusiveConsumerConfirmationBeforeHttp() throws Exception {
        setup();when(props.isTelegramExclusiveConsumerConfirmed()).thenReturn(false);assertThatThrownBy(()->service.poll(actor,true)).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);verifyNoInteractions(http);
    }
}
