package id.tbcall.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"tbcall.security.production=false", "tbcall.security.expose-verification-tokens=true",
        "tbcall.security.allowed-origins=https://client.example", "tbcall.security.cookie-secure=true"})
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Testcontainers
class IdentityAuthorizationIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired id.tbcall.application.auth.AuthService auth;
    @Autowired id.tbcall.application.auth.BootstrapAdmin bootstrap;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean id.tbcall.application.auth.SessionService sessions;
    @Autowired id.tbcall.security.SecurityProperties properties;
    @Autowired id.tbcall.authorization.ScopePolicies scopes;
    @Autowired id.tbcall.authorization.ClinicalSourceAuthorityPolicy sourceAuthority;
    @Autowired org.springframework.transaction.support.TransactionTemplate transactions;
    @Autowired jakarta.persistence.EntityManager em;
    @Autowired org.springframework.security.web.FilterChainProxy securityFilters;
    @Autowired org.springframework.security.web.csrf.CookieCsrfTokenRepository csrfRepository;
    private final JsonMapper json = JsonMapper.builder().build();
    private static final String PASSWORD = "Valid password 123!";

    @BeforeEach void clean() {
        restoreCookieCsrf();
        jdbc.execute("truncate users, patients, facilities restart identity cascade");
    }
    private void restoreCookieCsrf() {
        // Spring Security's csrf() test processor substitutes a session repository on the shared filter.
        // Browser-flow assertions must explicitly restore the actual application cookie repository.
        securityFilters.getFilterChains().forEach(chain -> chain.getFilters().stream()
                .filter(org.springframework.security.web.csrf.CsrfFilter.class::isInstance)
                .forEach(filter -> org.springframework.test.util.ReflectionTestUtils.setField(filter, "tokenRepository", csrfRepository)));
    }

    @Test void registrationOnlyDevelopmentDeliveryDoesNotClaimRecoveryAvailability() throws Exception {
        register("known@example.org",null,PASSWORD,201);
        for(String identity:List.of("known@example.org","unknown@example.org")) {
            for(String endpoint:List.of("/api/v1/auth/verification/resend","/api/v1/auth/password-reset/request")) {
                mvc.perform(post(endpoint).with(csrf()).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("identity",identity))))
                        .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("VERIFICATION_DELIVERY_UNAVAILABLE"));
            }
        }
        assertThat(jdbc.queryForObject("select count(*) from user_verification_tokens",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from user_verification_tokens where used_at is not null",Integer.class)).isZero();
    }

    @Test void registrationCreatesPendingUserWithNoRoleAndOnlyHashedSecrets() throws Exception {
        JsonNode response = register(" PERSON@EXAMPLE.ORG ", "081234567890", PASSWORD, 201);
        UUID id = UUID.fromString(response.path("id").asText());
        assertThat(jdbc.queryForObject("select status from users where id=?", String.class, id)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("select email from users where id=?", String.class, id)).isEqualTo("person@example.org");
        assertThat(jdbc.queryForObject("select phone from users where id=?", String.class, id)).isEqualTo("+6281234567890");
        String hash = jdbc.queryForObject("select password_hash from users where id=?", String.class, id);
        assertThat(hash).contains("$2").doesNotContain(PASSWORD);
        assertThat(jdbc.queryForObject("select count(*) from user_roles", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from patients", Integer.class)).isZero();
        assertThat(response.path("verificationTokens")).hasSize(2);
        for (JsonNode token : response.path("verificationTokens")) {
            assertThat(token.path("token").asText()).hasSizeGreaterThanOrEqualTo(43);
            assertThat(jdbc.queryForObject("select count(*) from user_verification_tokens where token_hash=?",
                    Integer.class, token.path("token").asText())).isZero();
        }
    }

    @Test void duplicateNormalizedEmailAndPhoneAreRejected() throws Exception {
        register("duplicate@example.org", "081234567890", PASSWORD, 201);
        register("DUPLICATE@example.org", null, PASSWORD, 409);
        register("other@example.org", "+6281234567890", PASSWORD, 409);
        assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isEqualTo(1);
    }

    @ParameterizedTest @ValueSource(strings = {"short", ""})
    void shortPasswordsAreRejected(String password) throws Exception { register("person@example.org", null, password, 400); }

    @Test void identityAndPasswordValidationIsIndonesianAndCorrelated() throws Exception {
        JsonNode problem = register(null, null, PASSWORD, 400);
        assertThat(problem.path("code").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(problem.path("traceId").asText()).isNotBlank();
        register("invalid", null, PASSWORD, 400);
        register(null, "abc", PASSWORD, 400);
        register("valid@example.org", null, "x".repeat(129), 400);
    }

    @Test void verificationActivatesAndTokenIsOneTime() throws Exception {
        JsonNode registered = register("person@example.org", null, PASSWORD, 201);
        String token = registered.path("verificationTokens").get(0).path("token").asText();
        call(post("/api/v1/auth/verify"), Map.of("token", token), 200);
        assertThat(jdbc.queryForObject("select status from users", String.class)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("select email_verified_at from users", OffsetDateTime.class)).isNotNull();
        call(post("/api/v1/auth/verify"), Map.of("token", token), 400);
        assertThat(jdbc.queryForObject("select count(*) from user_roles", Integer.class)).isZero();
    }

    @Test void expiredAndUnknownVerificationTokensCannotActivate() throws Exception {
        JsonNode registered = register("person@example.org", null, PASSWORD, 201);
        jdbc.update("update user_verification_tokens set created_at=now()-interval '2 hours', expires_at=now()-interval '1 hour'");
        call(post("/api/v1/auth/verify"), Map.of("token", registered.path("verificationTokens").get(0).path("token").asText()), 400);
        call(post("/api/v1/auth/verify"), Map.of("token", "unknown-token"), 400);
        assertThat(jdbc.queryForObject("select status from users", String.class)).isEqualTo("PENDING");
    }

    @Test void phoneOnlyVerificationAndLoginWork() throws Exception {
        JsonNode registered = register(null, "081234567890", PASSWORD, 201);
        call(post("/api/v1/auth/verify"), Map.of("token", registered.path("verificationTokens").get(0).path("token").asText()), 200);
        MvcResult result = login("081234567890", PASSWORD, 200);
        assertThat(result.getResponse().getCookie("TBCALL_SESSION")).isNotNull();
        assertThat(jdbc.queryForObject("select phone_verified_at from users", OffsetDateTime.class)).isNotNull();
    }

    @Test void loginUsesEightHourHashedSessionAndProtectedCookie() throws Exception {
        active("person@example.org");
        MvcResult result = login("person@example.org", PASSWORD, 200);
        Cookie cookie = result.getResponse().getCookie("TBCALL_SESSION");
        assertThat(cookie).isNotNull();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getSecure()).isTrue();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("SameSite=Strict");
        assertThat(jdbc.queryForObject("select token_hash from user_sessions", String.class)).isNotEqualTo(cookie.getValue());
        assertThat(jdbc.queryForObject("select extract(epoch from expires_at-created_at) from user_sessions", Double.class))
                .isBetween(28790.0, 28810.0);
        mvc.perform(get("/api/v1/me").cookie(cookie)).andExpect(status().isOk());
    }

    @Test void badPasswordAndUnknownIdentityHaveSameFailure() throws Exception {
        active("person@example.org");
        JsonNode bad = json.readTree(login("person@example.org", "wrong password", 401).getResponse().getContentAsString());
        JsonNode unknown = json.readTree(login("unknown@example.org", PASSWORD, 401).getResponse().getContentAsString());
        assertThat(bad.path("code")).isEqualTo(unknown.path("code"));
        assertThat(bad.path("detail")).isEqualTo(unknown.path("detail"));
        assertThat(jdbc.queryForObject("select count(*) from user_sessions", Integer.class)).isZero();
    }

    @ParameterizedTest @ValueSource(strings = {"PENDING", "SUSPENDED", "DISABLED"})
    void nonActiveUsersCannotLoginOrUseExistingSessions(String status) throws Exception {
        UUID user = active("person@example.org");
        Cookie cookie = session("person@example.org");
        jdbc.update("update users set status=?, version=version+1 where id=?", status, user);
        login("person@example.org", PASSWORD, 401);
        mvc.perform(get("/api/v1/me").cookie(cookie)).andExpect(status().isUnauthorized());
    }

    @Test void unverifiedIdentityCannotLoginEvenWhenOtherIdentityIsVerified() throws Exception {
        JsonNode registered = register("person@example.org", "081234567890", PASSWORD, 201);
        String token = registered.path("verificationTokens").get(0).path("token").asText();
        call(post("/api/v1/auth/verify"), Map.of("token", token), 200);
        login("081234567890", PASSWORD, 401);
    }

    @Test void logoutRevokesSessionAndExpiredSessionsAreDenied() throws Exception {
        active("person@example.org");
        Cookie cookie = session("person@example.org");
        mvc.perform(post("/api/v1/auth/logout").cookie(cookie).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select revoked_at from user_sessions", OffsetDateTime.class)).isNotNull();
        mvc.perform(get("/api/v1/me").cookie(cookie)).andExpect(status().isUnauthorized());
        Cookie expired = session("person@example.org");
        jdbc.update("update user_sessions set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where revoked_at is null");
        mvc.perform(get("/api/v1/me").cookie(expired)).andExpect(status().isUnauthorized());
    }

    @Test void csrfIsRequiredAndCookieHeaderFlowWorks() throws Exception {
        active("person@example.org"); Cookie session = session("person@example.org");
        restoreCookieCsrf();
        mvc.perform(post("/api/v1/auth/logout").cookie(session)).andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        MvcResult safe = mvc.perform(get("/api/v1/me").cookie(session)).andExpect(status().isOk()).andReturn();
        Cookie xsrf = safe.getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();
        mvc.perform(post("/api/v1/auth/logout").cookie(session, xsrf).header("X-XSRF-TOKEN", xsrf.getValue()))
                .andExpect(status().isNoContent());
    }

    @Test void corsAllowsOnlyConfiguredOrigins() throws Exception {
        mvc.perform(options("/api/v1/auth/login").header("Origin", "https://client.example")
                .header("Access-Control-Request-Method", "POST")).andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://client.example"));
        mvc.perform(options("/api/v1/auth/login").header("Origin", "https://evil.example")
                .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("CORS_DENIED"));
    }

    @Test void meDoesNotExposeClinicalDataOrSecretHashes() throws Exception {
        active("person@example.org");
        MvcResult result = mvc.perform(get("/api/v1/me").cookie(session("person@example.org"))).andExpect(status().isOk()).andReturn();
        JsonNode body = json.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("email").asText()).isEqualTo("person@example.org");
        assertThat(body.path("roles")).isEmpty(); assertThat(body.path("permissions")).isEmpty();
        assertThat(body.path("activeFacilities")).isEmpty(); assertThat(body.path("supporterCaseIds")).isEmpty();
        assertThat(body.path("patientLink").isNull()).isTrue();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("password", "tokenHash", "nik", "hiv", "diagnoses");
    }

    @Test void publicNikClaimIsUnavailableAndClinicalEndpointsDenyOrdinaryAccounts() throws Exception {
        active("person@example.org"); Cookie cookie = session("person@example.org");
        mvc.perform(post("/api/v1/patients/claim").cookie(cookie).with(csrf()).contentType("application/json")
                .content("{\"nik\":\"1234567890123456\"}")).andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
        mvc.perform(get("/api/v1/patients").cookie(cookie)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test void officerCanVerifySelfLinkAndAssignPatientRole() throws Exception {
        Fixture f = fixture(); UUID target = active("patient@example.org");
        JsonNode link = call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", target), 201);
        assertThat(link.path("verificationStatus").asText()).isEqualTo("VERIFIED");
        assertThat(jdbc.queryForObject("select verified_by from patient_user_links", UUID.class)).isEqualTo(f.officerId);
        assertThat(jdbc.queryForObject("select verified_at from patient_user_links", OffsetDateTime.class)).isNotNull();
        assertThat(roles(target)).containsExactly("PATIENT");
        mvc.perform(get("/api/v1/me").cookie(session("patient@example.org"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.patientLink.patientId").value(f.patient.toString()))
                .andExpect(jsonPath("$.roles[0].name").value("Pasien"));
    }

    @Test void outOfScopeOfficerCannotLinkPatientOrSupporter() throws Exception {
        Fixture f = fixture(); UUID target = active("patient@example.org");
        jdbc.update("update user_facilities set active=false where user_id=?", f.officerId);
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", target), 403);
        call(post(supporterPath(f)).cookie(f.officer).header("If-Match", "\"0\""), Map.of("userId", target), 403);
        assertThat(jdbc.queryForObject("select count(*) from patient_user_links", Integer.class)).isZero();
    }

    @Test void ownershipRequiresExplicitRevokeAndOneUserCannotOwnTwoPatients() throws Exception {
        Fixture f = fixture(); UUID one = active("one@example.org"); UUID two = active("two@example.org");
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", one), 201);
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", two), 409);
        UUID otherPatient = patient(f.facility);
        call(post(patientPath(otherPatient)).cookie(f.officer), Map.of("userId", one), 409);
        mvc.perform(delete(patientPath(f.patient)).cookie(f.officer).with(csrf())).andExpect(status().is(428));
        mvc.perform(delete(patientPath(f.patient)).cookie(f.officer).with(csrf()).header("X-Expected-Link-Id", jdbc.queryForObject("select id from patient_user_links where patient_id=? and verification_status='VERIFIED'", UUID.class, f.patient)).header("If-Match", "\"9\""))
                .andExpect(status().isConflict());
        mvc.perform(delete(patientPath(f.patient)).cookie(f.officer).with(csrf()).header("X-Expected-Link-Id", jdbc.queryForObject("select id from patient_user_links where patient_id=? and verification_status='VERIFIED'", UUID.class, f.patient)).header("If-Match", "\"0\""))
                .andExpect(status().isOk());
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", two), 201);
        assertThat(roles(one)).doesNotContain("PATIENT");
        assertThat(roles(two)).contains("PATIENT");
    }

    @Test void relinkingRevokedExistingRecordRequiresVersion() throws Exception {
        Fixture f = fixture(); UUID target = active("target@example.org");
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", target), 201);
        mvc.perform(delete(patientPath(f.patient)).cookie(f.officer).with(csrf()).header("X-Expected-Link-Id", jdbc.queryForObject("select id from patient_user_links where patient_id=? and verification_status='VERIFIED'", UUID.class, f.patient)).header("If-Match", "\"0\""))
                .andExpect(status().isOk());
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", target), 428);
        JsonNode link = call(post(patientPath(f.patient)).cookie(f.officer).header("If-Match", "\"1\""), Map.of("userId", target), 200);
        assertThat(link.path("version").asLong()).isEqualTo(2L);
    }

    @Test void targetMustBeActiveAndVerified() throws Exception {
        Fixture f = fixture(); JsonNode pending = register("pending@example.org", null, PASSWORD, 201);
        UUID id = UUID.fromString(pending.path("id").asText());
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", id), 400);
        jdbc.update("update users set status='ACTIVE',version=version+1 where id=?", id);
        call(post(supporterPath(f)).cookie(f.officer).header("If-Match", "\"0\""), Map.of("userId", id), 400);
    }

    @Test void supporterLinkRoleScopeAndLastUnlinkBehavior() throws Exception {
        Fixture f = fixture(); UUID target = active("supporter@example.org");
        JsonNode result = call(post(supporterPath(f)).cookie(f.officer).header("If-Match", "\"0\""), Map.of("userId", target), 200);
        assertThat(result.path("version").asLong()).isEqualTo(1L);
        assertThat(roles(target)).contains("TREATMENT_SUPPORTER");
        UUID second = supporter(f.tbCase);
        call(post("/api/v1/cases/" + f.tbCase + "/supporters/" + second + "/account-link").cookie(f.officer)
                .header("If-Match", "\"0\""), Map.of("userId", target), 200);
        mvc.perform(get("/api/v1/me").cookie(session("supporter@example.org"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.supporterCaseIds[0]").value(f.tbCase.toString()));
        mvc.perform(delete(supporterPath(f)).cookie(f.officer).with(csrf()).header("If-Match", "\"1\""))
                .andExpect(status().isOk());
        assertThat(roles(target)).contains("TREATMENT_SUPPORTER");
        mvc.perform(delete("/api/v1/cases/" + f.tbCase + "/supporters/" + second + "/account-link")
                .cookie(f.officer).with(csrf()).header("If-Match", "\"1\"")) .andExpect(status().isOk());
        assertThat(roles(target)).doesNotContain("TREATMENT_SUPPORTER");
    }

    @Test void supporterMutationsRequireFreshVersionAndCorrectCase() throws Exception {
        Fixture f = fixture(); UUID target = active("supporter@example.org");
        call(post(supporterPath(f)).cookie(f.officer), Map.of("userId", target), 428);
        call(post(supporterPath(f)).cookie(f.officer).header("If-Match", "*"), Map.of("userId", target), 400);
        call(post(supporterPath(f)).cookie(f.officer).header("If-Match", "\"0\""), Map.of("userId", target), 200);
        JsonNode stale = call(post(supporterPath(f)).cookie(f.officer).header("If-Match", "\"0\""), Map.of("userId", target), 409);
        assertThat(stale.path("code").asText()).isEqualTo("OPTIMISTIC_LOCK_CONFLICT");
        assertThat(stale.path("detail").asText()).isEqualTo("Data telah berubah sejak terakhir dibuka. Muat ulang data sebelum menyimpan kembali.");
        UUID foreign = supporter(UUID.randomUUID(), false);
        call(post("/api/v1/cases/" + f.tbCase + "/supporters/" + foreign + "/account-link").cookie(f.officer)
                .header("If-Match", "\"0\""), Map.of("userId", target), 404);
    }

    @ParameterizedTest @ValueSource(strings = {"SYSTEM_ADMIN", "FACILITY_ADMIN", "PROGRAM_MONITOR"})
    void administrativeRolesNeverGainClinicalScope(String role) throws Exception {
        Fixture f = fixture(); UUID admin = active("admin@example.org"); assign(admin, role);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)", admin, f.facility);
        call(post(patientPath(f.patient)).cookie(session("admin@example.org")), Map.of("userId", f.officerId), 403);
    }

    @Test void removedPermissionTakesEffectOnNextRequest() throws Exception {
        Fixture f = fixture(); UUID target = active("patient@example.org");
        jdbc.update("delete from user_roles where user_id=?", f.officerId);
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", target), 403);
    }

    @Test void auditContainsRequiredActionsAndNoRawSecrets() throws Exception {
        Fixture f = fixture(); UUID target = active("patient@example.org"); Cookie cookie = session("patient@example.org");
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", target), 201);
        mvc.perform(delete(patientPath(f.patient)).cookie(f.officer).with(csrf()).header("X-Expected-Link-Id", jdbc.queryForObject("select id from patient_user_links where patient_id=? and verification_status='VERIFIED'", UUID.class, f.patient)).header("If-Match", "\"0\""))
                .andExpect(status().isOk());
        call(post(supporterPath(f)).cookie(f.officer).header("If-Match", "\"0\""), Map.of("userId", target), 200);
        mvc.perform(delete(supporterPath(f)).cookie(f.officer).with(csrf()).header("If-Match", "\"1\""))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/auth/logout").cookie(cookie).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForList("select distinct action from audit_logs", String.class)).contains(
                "USER_REGISTERED", "CONTACT_VERIFIED", "LOGIN_SUCCESS", "LOGOUT", "PATIENT_LINK_VERIFIED",
                "PATIENT_LINK_REVOKED", "SUPPORTER_LINKED", "SUPPORTER_UNLINKED");
        String audit = jdbc.queryForList("select metadata::text from audit_logs", String.class).toString();
        assertThat(audit).doesNotContain(PASSWORD, cookie.getValue(), "password", "token");
        assertThat(jdbc.queryForList("select request_id from audit_logs", String.class)).allMatch(value -> value != null && !value.isBlank());
    }

    @Test void bootstrapCreatesOnlyFirstAdminWithVerifiedIdentityAndNoClinicalScope() throws Exception {
        properties.setBootstrapEmail("first-admin@example.org"); properties.setBootstrapPassword(PASSWORD);
        try {
            bootstrap.initialize(); bootstrap.initialize();
            UUID admin=jdbc.queryForObject("select id from users", UUID.class);
            assertThat(roles(admin)).containsExactly("SYSTEM_ADMIN");
            assertThat(jdbc.queryForObject("select email_verified_at from users", OffsetDateTime.class)).isNotNull();
            assertThat(jdbc.queryForObject("select status from users", String.class)).isEqualTo("ACTIVE");
            Cookie cookie=session("first-admin@example.org");
            var actor=sessions.resolve(cookie.getValue()).orElseThrow();
            assertThat(scopes.officerFacility(actor, "PATIENT_LINK_VERIFY", UUID.randomUUID())).isFalse();
            assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='BOOTSTRAP_ADMIN_CREATED'", Integer.class)).isEqualTo(1);
            properties.setBootstrapEmail("second-admin@example.org"); bootstrap.initialize();
            assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForList("select metadata::text from audit_logs", String.class).toString()).doesNotContain(PASSWORD);
        } finally { properties.setBootstrapEmail(null); properties.setBootstrapPassword(null); }
    }

    @Test void bootstrapWithNoCredentialsDoesNothingAndDoesNotPromoteExistingUser() throws Exception {
        bootstrap.initialize(); assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isZero();
        active("existing@example.org"); properties.setBootstrapEmail("existing@example.org"); properties.setBootstrapPassword(PASSWORD);
        try { org.assertj.core.api.Assertions.assertThatThrownBy(bootstrap::initialize).isInstanceOf(IllegalStateException.class); }
        finally { properties.setBootstrapEmail(null); properties.setBootstrapPassword(null); }
        assertThat(jdbc.queryForObject("select count(*) from user_roles", Integer.class)).isZero();
    }

    @Test void full128CharacterPasswordsRemainDistinctBeyondBcryptLimit() throws Exception {
        String prefix="a".repeat(100); String correct=prefix+"b".repeat(28); String different=prefix+"c".repeat(28);
        JsonNode registered=register("long@example.org", null, correct, 201);
        call(post("/api/v1/auth/verify"), Map.of("token", registered.path("verificationTokens").get(0).path("token").asText()), 200);
        login("long@example.org", correct, 200); login("long@example.org", different, 401);
    }

    @Test void concurrentVerificationConsumesTokenExactlyOnce() throws Exception {
        JsonNode registered=register("one-time@example.org", null, PASSWORD, 201);
        String token=registered.path("verificationTokens").get(0).path("token").asText();
        CountDownLatch start=new CountDownLatch(1);
        try (var executor=Executors.newFixedThreadPool(2)) {
            var task=(java.util.concurrent.Callable<Boolean>) () -> { start.await(); try { auth.verify(token); return true; }
                catch (id.tbcall.application.common.ApplicationFailure failure) { assertThat(failure.code()).isEqualTo("VERIFICATION_TOKEN_INVALID"); return false; } };
            var one=executor.submit(task); var two=executor.submit(task); start.countDown();
            assertThat(List.of(one.get(20, TimeUnit.SECONDS), two.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='CONTACT_VERIFIED'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForList("select metadata::text from audit_logs", String.class).toString()).doesNotContain(token);
    }

    @Test void concurrentPatientLinkersCannotClaimOneUserTwice() throws Exception {
        Fixture f=fixture(); UUID other=patient(f.facility); UUID target=active("target@example.org");
        CountDownLatch start=new CountDownLatch(1);
        try (var executor=Executors.newFixedThreadPool(2)) {
            var one=executor.submit(() -> { start.await(); return mvc.perform(post(patientPath(f.patient)).cookie(f.officer).with(csrf())
                    .contentType("application/json").content(json.writeValueAsString(Map.of("userId", target)))).andReturn().getResponse().getStatus(); });
            var two=executor.submit(() -> { start.await(); return mvc.perform(post(patientPath(other)).cookie(f.officer).with(csrf())
                    .contentType("application/json").content(json.writeValueAsString(Map.of("userId", target)))).andReturn().getResponse().getStatus(); });
            start.countDown(); assertThat(List.of(one.get(20, TimeUnit.SECONDS), two.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(201, 409);
        }
        assertThat(jdbc.queryForObject("select count(*) from patient_user_links where verification_status='VERIFIED'", Integer.class)).isEqualTo(1);
        assertThat(roles(target)).containsExactly("PATIENT");
    }

    @Test void concurrentSupporterChangesUseJpaVersionAndRollbackLosingRoleAssignment() throws Exception {
        Fixture f=fixture(); UUID one=active("one@example.org"), two=active("two@example.org"); CountDownLatch start=new CountDownLatch(1);
        try (var executor=Executors.newFixedThreadPool(2)) {
            var first=executor.submit(() -> { start.await(); return mvc.perform(post(supporterPath(f)).cookie(f.officer).with(csrf()).header("If-Match", "\"0\"")
                    .contentType("application/json").content(json.writeValueAsString(Map.of("userId", one)))).andReturn().getResponse().getStatus(); });
            var second=executor.submit(() -> { start.await(); return mvc.perform(post(supporterPath(f)).cookie(f.officer).with(csrf()).header("If-Match", "\"0\"")
                    .contentType("application/json").content(json.writeValueAsString(Map.of("userId", two)))).andReturn().getResponse().getStatus(); });
            start.countDown(); assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(200, 409);
        }
        UUID winner=jdbc.queryForObject("select linked_user_id from patient_supporters where id=?", UUID.class, f.supporter);
        assertThat(roles(winner)).contains("TREATMENT_SUPPORTER");
        assertThat(roles(winner.equals(one) ? two : one)).doesNotContain("TREATMENT_SUPPORTER");
        assertThat(jdbc.queryForObject("select version from patient_supporters where id=?", Long.class, f.supporter)).isEqualTo(1);
    }

    @Test void databaseIndexesPreventBothKindsOfDuplicateVerifiedSelfOwnership() throws Exception {
        Fixture f=fixture(); UUID one=active("one@example.org"), two=active("two@example.org"), other=patient(f.facility);
        jdbc.update("insert into patient_user_links(user_id,patient_id,verification_status) values (?,?,'VERIFIED')", one, f.patient);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("insert into patient_user_links(user_id,patient_id,verification_status) values (?,?,'VERIFIED')", two, f.patient))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("insert into patient_user_links(user_id,patient_id,verification_status) values (?,?,'VERIFIED')", one, other))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void selfSupporterAndLabPoliciesRequireBothPermissionAndCurrentScope() throws Exception {
        Fixture f=fixture(); UUID target=active("target@example.org");
        call(post(patientPath(f.patient)).cookie(f.officer), Map.of("userId", target), 201);
        call(post(supporterPath(f)).cookie(f.officer).header("If-Match", "\"0\""), Map.of("userId", target), 200);
        Cookie cookie=session("target@example.org"); var actor=sessions.resolve(cookie.getValue()).orElseThrow();
        assertThat(scopes.patientSelf(actor, "PATIENT_READ", f.patient)).isTrue();
        assertThat(scopes.patientSelf(actor, "PATIENT_UPDATE", f.patient)).isFalse();
        assertThat(scopes.patientSelf(actor, "PATIENT_READ", UUID.randomUUID())).isFalse();
        assertThat(scopes.supporterCase(actor, "ADHERENCE_RECORD", f.tbCase)).isTrue();
        assertThat(scopes.supporterCase(actor, "DIAGNOSIS_WRITE", f.tbCase)).isFalse();
        UUID lab=active("lab@example.org"); assign(lab, "LAB_STAFF");
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)", lab, f.facility);
        var labActor=sessions.resolve(session("lab@example.org").getValue()).orElseThrow();
        transactions.executeWithoutResult(status -> {
            var request=new id.tbcall.persistence.entity.LabRequest();
            request.setTestingFacility(em.getReference(id.tbcall.persistence.entity.Facility.class, f.facility));
            assertThat(scopes.labRequest(labActor, "LAB_RESULT_WRITE", request)).isTrue();
            assertThat(scopes.labRequest(labActor, "TREATMENT_WRITE", request)).isFalse();
            assertThat(scopes.labRequest(actor, "LAB_RESULT_WRITE", request)).isFalse();
        });
        jdbc.update("update patient_supporters set active=false,version=version+1 where id=?", f.supporter);
        assertThat(scopes.supporterCase(sessions.resolve(cookie.getValue()).orElseThrow(), "ADHERENCE_RECORD", f.tbCase)).isFalse();
        var officer=sessions.resolve(f.officer.getValue()).orElseThrow();
        sourceAuthority.requireLocalEdit(officer, "CASE_WRITE", f.facility, "TB_CASE", f.tbCase);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> sourceAuthority.requireLocalEdit(actor, "CASE_WRITE", f.facility, "TB_CASE", f.tbCase))
                .isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
    }

    @Test void malformedRequestsAndTraceIdsAreSafeProblemResponses() throws Exception {
        String trace="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        mvc.perform(post("/api/v1/auth/register").with(csrf()).header("X-Request-ID", trace).contentType("application/json").content("{broken"))
                .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.traceId").value(trace)).andExpect(header().string("X-Request-ID", trace));
        mvc.perform(post("/api/v1/auth/login").contentType("application/json").content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test void missingDeliveryAdapterFailsWithoutCreatingAnUnverifiableAccount() throws Exception {
        properties.setExposeVerificationTokens(false);
        try {
            JsonNode result=register("undelivered@example.org", null, PASSWORD, 503);
            assertThat(result.path("code").asText()).isEqualTo("VERIFICATION_DELIVERY_UNAVAILABLE");
            assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from user_verification_tokens", Integer.class)).isZero();
        } finally { properties.setExposeVerificationTokens(true); }
    }

    @ParameterizedTest @ValueSource(strings={"EMAIL", "PHONE"})
    void concurrentDuplicateRegistrationReturnsConflictAndRollsBackLoser(String identity) throws Exception {
        CountDownLatch start=new CountDownLatch(1);
        Map<String, String> one=Map.of("email", "first@example.org", "phone", "081234567890", "password", PASSWORD);
        Map<String, String> two=Map.of("email", identity.equals("EMAIL") ? "FIRST@example.org" : "second@example.org",
                "phone", identity.equals("PHONE") ? "+6281234567890" : "081234567891", "password", PASSWORD);
        try (var executor=Executors.newFixedThreadPool(2)) {
            var first=executor.submit(() -> { start.await(); return mvc.perform(post("/api/v1/auth/register").with(csrf())
                    .contentType("application/json").content(json.writeValueAsString(one))).andReturn().getResponse().getStatus(); });
            var second=executor.submit(() -> { start.await(); return mvc.perform(post("/api/v1/auth/register").with(csrf())
                    .contentType("application/json").content(json.writeValueAsString(two))).andReturn().getResponse().getStatus(); });
            start.countDown(); assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(201, 409);
        }
        assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='USER_REGISTERED'", Integer.class)).isEqualTo(1);
    }

    @Test void sessionStoreFailureReturnsSafeCorrelatedProblem() throws Exception {
        String secret="s".repeat(43);
        org.mockito.Mockito.doThrow(new org.springframework.dao.DataAccessResourceFailureException("Private database failure containing "+secret))
                .when(sessions).resolve(secret);
        var result=new java.util.concurrent.atomic.AtomicReference<MvcResult>();
        org.assertj.core.api.Assertions.assertThatCode(() -> result.set(mvc.perform(get("/api/v1/me")
                .cookie(new Cookie("TBCALL_SESSION", secret))).andReturn())).doesNotThrowAnyException();
        assertThat(result.get().getResponse().getStatus()).isEqualTo(503);
        assertThat(result.get().getResponse().getContentType()).startsWith("application/problem+json");
        JsonNode problem=json.readTree(result.get().getResponse().getContentAsString());
        assertThat(problem.path("code").asText()).isEqualTo("SESSION_STORE_UNAVAILABLE");
        assertThat(problem.path("traceId").asText()).isEqualTo(result.get().getResponse().getHeader("X-Request-ID"));
        assertThat(result.get().getResponse().getContentAsString()).doesNotContain(secret, "Private database", "Exception");
    }

    @Test void realBrowserCsrfFlowProtectsPublicAuthAndRotatesAfterLogin() throws Exception {
        MvcResult initial=mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized()).andReturn();
        Cookie csrfCookie=initial.getResponse().getCookie("XSRF-TOKEN"); assertThat(csrfCookie).isNotNull();
        MvcResult registration=mvc.perform(post("/api/v1/auth/register").cookie(csrfCookie).header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType("application/json").content(json.writeValueAsString(Map.of("email", "browser@example.org", "password", PASSWORD))))
                .andExpect(status().isCreated()).andReturn();
        String token=json.readTree(registration.getResponse().getContentAsString()).path("verificationTokens").get(0).path("token").asText();
        mvc.perform(post("/api/v1/auth/verify").cookie(csrfCookie).header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType("application/json").content(json.writeValueAsString(Map.of("token", token)))).andExpect(status().isOk());
        MvcResult login=mvc.perform(post("/api/v1/auth/login").cookie(csrfCookie).header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType("application/json").content(json.writeValueAsString(Map.of("identity", "browser@example.org", "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn();
        assertThat(login.getResponse().getCookie("XSRF-TOKEN").getMaxAge()).isZero();
        Cookie session=login.getResponse().getCookie("TBCALL_SESSION");
        MvcResult refreshed=mvc.perform(get("/api/v1/me").cookie(session)).andExpect(status().isOk()).andReturn();
        Cookie next=refreshed.getResponse().getCookie("XSRF-TOKEN"); assertThat(next).isNotNull();
        assertThat(next.getValue()).isNotEqualTo(csrfCookie.getValue());
        mvc.perform(post("/api/v1/auth/logout").cookie(session, next).header("X-XSRF-TOKEN", csrfCookie.getValue()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/logout").cookie(session, next).header("X-XSRF-TOKEN", next.getValue()))
                .andExpect(status().isNoContent());
    }

    private JsonNode register(String email, String phone, String password, int status) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>(); body.put("email", email); body.put("phone", phone); body.put("password", password);
        return call(post("/api/v1/auth/register"), body, status);
    }
    private JsonNode call(MockHttpServletRequestBuilder request, Object body, int expected) throws Exception {
        MvcResult result = mvc.perform(request.with(csrf()).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().is(expected)).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }
    private MvcResult login(String identity, String password, int expected) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("identity", identity, "password", password))))
                .andExpect(status().is(expected)).andReturn();
    }
    private Cookie session(String email) throws Exception { return login(email, PASSWORD, 200).getResponse().getCookie("TBCALL_SESSION"); }
    private UUID active(String email) throws Exception {
        JsonNode response = register(email, null, PASSWORD, 201);
        call(post("/api/v1/auth/verify"), Map.of("token", response.path("verificationTokens").get(0).path("token").asText()), 200);
        return UUID.fromString(response.path("id").asText());
    }
    private List<String> roles(UUID user) { return jdbc.queryForList("select r.code from user_roles ur join roles r on ur.role_id=r.id where ur.user_id=? order by r.code", String.class, user); }
    private void assign(UUID user, String role) { jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?", user, role); }
    private Fixture fixture() throws Exception {
        UUID officer = active("officer@example.org"); assign(officer, "TB_OFFICER");
        UUID facility = jdbc.queryForObject("insert into facilities(name) values ('Fasyankes uji') returning id", UUID.class);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)", officer, facility);
        UUID patient = patient(facility);
        UUID registration = jdbc.queryForObject("select id from tb_registrations where patient_id=?", UUID.class, patient);
        UUID diagnosis = jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date) values (?,current_date) returning id", UUID.class, registration);
        UUID tbCase = jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id) values (?,?,?) returning id",
                UUID.class, registration, diagnosis, facility);
        return new Fixture(officer, session("officer@example.org"), facility, patient, tbCase, supporter(tbCase));
    }
    private UUID patient(UUID facility) {
        UUID patient = jdbc.queryForObject("insert into patients(full_name) values ('Pasien uji') returning id", UUID.class);
        jdbc.update("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,current_date)", patient, facility);
        return patient;
    }
    private UUID supporter(UUID tbCase) { return supporter(tbCase, true); }
    private UUID supporter(UUID tbCase, boolean valid) {
        if (!valid) return UUID.randomUUID();
        return jdbc.queryForObject("insert into patient_supporters(case_id,supporter_type,full_name) values (?,'PMO','Pendamping uji') returning id", UUID.class, tbCase);
    }
    private String patientPath(UUID patient) { return "/api/v1/patients/" + patient + "/account-link"; }
    private String supporterPath(Fixture f) { return "/api/v1/cases/" + f.tbCase + "/supporters/" + f.supporter + "/account-link"; }
    private record Fixture(UUID officerId, Cookie officer, UUID facility, UUID patient, UUID tbCase, UUID supporter) {}
}
