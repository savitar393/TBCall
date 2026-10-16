package id.tbcall.application;

import id.tbcall.application.reminder.DisabledReminderTransport;
import id.tbcall.application.reminder.ReminderProperties;
import id.tbcall.application.reminder.ReminderTransports;
import id.tbcall.application.reminder.SimulatedWhatsAppTransport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/** Selection exercises the real factory without a database or a messaging network. */
@ExtendWith(MockitoExtension.class)
class ReminderTransportTest {
    @Mock ReminderProperties properties;
    @Mock SimulatedWhatsAppTransport whatsapp;
    @Mock DisabledReminderTransport disabled;
    @InjectMocks ReminderTransports transports;

    @ParameterizedTest @NullAndEmptySource @ValueSource(strings={"SMS","EMAIL","whatsapp"," WHATSAPP "})
    void simulatedModeRejectsEveryUnsupportedChannel(String channel) {
        lenient().when(properties.getMode()).thenReturn(ReminderProperties.Mode.SIMULATED);
        assertThatIllegalArgumentException().isThrownBy(()->transports.transport(channel));
    }

    @ParameterizedTest @NullAndEmptySource @ValueSource(strings={"SMS","EMAIL","whatsapp"," WHATSAPP "})
    void disabledModeStillRejectsEveryUnsupportedChannel(String channel) {
        lenient().when(properties.getMode()).thenReturn(ReminderProperties.Mode.DISABLED);
        assertThatIllegalArgumentException().isThrownBy(()->transports.transport(channel));
    }

    @Test void simulatedModeSelectsOnlyTheWhatsAppSimulation() {
        when(properties.getMode()).thenReturn(ReminderProperties.Mode.SIMULATED);
        assertThat(transports.available()).isTrue();
        assertThat(transports.transport("WHATSAPP")).isSameAs(whatsapp);
    }

    @Test void defaultDisabledModeCannotSelectTheWhatsAppSimulation() {
        when(properties.getMode()).thenReturn(ReminderProperties.Mode.DISABLED);
        assertThat(transports.available()).isFalse();
        assertThat(transports.transport("WHATSAPP")).isSameAs(disabled);
    }
}
