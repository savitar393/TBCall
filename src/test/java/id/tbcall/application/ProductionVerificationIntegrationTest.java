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
            return (purpose, destination, secret, expiry) -> {
                assertThat(purpose).isEqualTo("EMAIL_VERIFICATION"); assertThat(destination).isEqualTo("production@example.org");
                delivered.add(secret);
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
    }
}
