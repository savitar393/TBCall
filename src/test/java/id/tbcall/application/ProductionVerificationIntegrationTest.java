package id.tbcall.application;

import id.tbcall.application.auth.VerificationDeliveryPort;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=true", "tbcall.security.expose-verification-tokens=false"})
@AutoConfigureMockMvc @Testcontainers @Import(ProductionVerificationIntegrationTest.Delivery.class)
class ProductionVerificationIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl); r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired BlockingQueue<String> delivered;
    @TestConfiguration static class Delivery {
        @Bean BlockingQueue<String> delivered() { return new LinkedBlockingQueue<>(); }
        @Bean VerificationDeliveryPort delivery(BlockingQueue<String> delivered) {
            return new VerificationDeliveryPort() {
                public boolean isAvailable() { return true; }
                public void deliver(String purpose, String destination, String secret, java.time.OffsetDateTime expiry) {
                    assertThat(purpose).isIn("EMAIL_VERIFICATION","PASSWORD_RESET"); assertThat(destination).isEqualTo("production@example.org");
                    delivered.add(secret);
                }
            };
        }
    }
    @Test void productionDeliversThroughPortWithoutReturningOrPersistingRawSecret() throws Exception {
        String body=mvc.perform(post("/api/v1/auth/register").with(csrf()).contentType("application/json")
                .content("{\"email\":\"production@example.org\",\"password\":\"Production password 123!\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.verificationTokens").isEmpty()).andReturn().getResponse().getContentAsString();
        String secret=delivered.remove(); assertThat(body).doesNotContain(secret);
        assertThat(jdbc.queryForObject("select token_hash from user_verification_tokens", String.class)).doesNotContain(secret);
        assertThat(jdbc.queryForList("select metadata::text from audit_logs", String.class).toString()).doesNotContain(secret);
        String input=JsonMapper.builder().build().writeValueAsString(java.util.Map.of("token", secret));
        mvc.perform(post("/api/v1/auth/verify").with(csrf()).contentType("application/json").content(input)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                .content("{\"identity\":\"production@example.org\",\"password\":\"Production password 123!\"}"))
                .andExpect(status().isOk()).andExpect(cookie().httpOnly("TBCALL_SESSION", true))
                .andExpect(cookie().secure("TBCALL_SESSION", true))
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("SameSite=Strict")));
        String known=mvc.perform(post("/api/v1/auth/password-reset/request").with(csrf()).contentType("application/json")
                .content("{\"identity\":\"production@example.org\"}")).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        String reset=delivered.remove();
        String unknown=mvc.perform(post("/api/v1/auth/password-reset/request").with(csrf()).contentType("application/json")
                .content("{\"identity\":\"unknown@example.org\"}")).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        assertThat(known).isEqualTo(unknown).doesNotContain(secret,reset,"production@example.org");
        String resend=mvc.perform(post("/api/v1/auth/verification/resend").with(csrf()).contentType("application/json")
                .content("{\"identity\":\"production@example.org\"}")).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        assertThat(resend).doesNotContain(secret,reset); assertThat(delivered).isEmpty();
        mvc.perform(post("/api/v1/auth/password-reset/confirm").with(csrf()).contentType("application/json")
                .content(JsonMapper.builder().build().writeValueAsString(java.util.Map.of("token",reset,"newPassword","Recovered password 123!"))))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from user_sessions where revoked_at is null",Integer.class)).isZero();
        assertThat(jdbc.queryForList("select token_hash from user_verification_tokens",String.class).toString()).doesNotContain(secret,reset);
        assertThat(jdbc.queryForList("select metadata::text from audit_logs",String.class).toString()).doesNotContain(secret,reset,"Recovered password 123!");
    }
}
