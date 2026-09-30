package id.tbcall.application;

import id.tbcall.application.auth.VerificationDeliveryPort;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false", "tbcall.security.expose-verification-tokens=true",
        "tbcall.security.allowed-origins=https://client.example"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers @Import(AdminRecoveryIntegrationTest.DeliveryConfig.class)
class AdminRecoveryIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl); r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired Delivery delivery;
    @Autowired id.tbcall.authorization.ScopePolicies scopes;
    @Autowired id.tbcall.application.auth.SessionService sessions;
    @Autowired id.tbcall.application.admin.UserAdministrationService userAdministration;
    @Autowired id.tbcall.application.admin.FacilityMembershipService memberships;
    @Autowired id.tbcall.application.admin.FacilityAdministrationService facilities;
    @Autowired id.tbcall.application.auth.AccountRecoveryService recovery;
    @Autowired id.tbcall.application.auth.AuthService auth;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PASSWORD="Admin recovery password 123!";
    private Cookie admin;
    private UUID adminId;
    static class Delivery implements VerificationDeliveryPort {
        final AtomicBoolean available=new AtomicBoolean(true);
        final List<Delivered> messages=new CopyOnWriteArrayList<>();
        public boolean isAvailable() { return available.get(); }
        public void deliver(String purpose, String destination, String token, OffsetDateTime expiry) {
            messages.add(new Delivered(purpose, destination, token));
        }
        String latest(String purpose) { return messages.stream().filter(m -> m.purpose.equals(purpose)).reduce((a,b)->b).orElseThrow().token; }
    }
    record Delivered(String purpose, String destination, String token) {}
    @TestConfiguration static class DeliveryConfig { @Bean Delivery delivery() { return new Delivery(); } }
    @BeforeEach void setup() throws Exception {
        jdbc.execute("truncate users,patients,facilities restart identity cascade"); delivery.available.set(true); delivery.messages.clear();
        adminId=active("admin@example.org"); role(adminId, "SYSTEM_ADMIN"); admin=login("admin@example.org", PASSWORD, 200);
    }

    @Test void systemAdminCanCreatePatchAndDeactivateFacilityWithVersions() throws Exception {
        JsonNode created=call(post("/api/v1/admin/facilities").cookie(admin), Map.of("name", "Fasyankes A", "provinceCode", "31"), 201);
        UUID id=UUID.fromString(created.path("id").asText()); assertThat(created.path("version").asLong()).isZero();
        call(patch(facilityPath(id)).cookie(admin), Map.of("name", "Baru"), 428);
        JsonNode changed=call(patch(facilityPath(id)).cookie(admin).header("If-Match", "\"0\""), Map.of("name", "Baru"), 200);
        assertThat(changed.path("provinceCode").asText()).isEqualTo("31"); assertThat(changed.path("version").asLong()).isEqualTo(1);
        call(patch(facilityPath(id)).cookie(admin).header("If-Match", "\"0\""), Map.of("name", "Stale"), 409);
        call(post(facilityPath(id)+"/deactivate").cookie(admin).header("If-Match", "\"1\""), null, 200);
        assertThat(jdbc.queryForObject("select active from facilities where id=?", Boolean.class, id)).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from facilities", Integer.class)).isEqualTo(1);
        audited("FACILITY_CREATED","FACILITY_UPDATED","FACILITY_DEACTIVATED");
    }

    @Test void facilityInputsAreExplicitAndPatchCanClearOptionalFields() throws Exception {
        call(post("/api/v1/admin/facilities").cookie(admin), Map.of("name", "F", "active", false), 400);
        call(post("/api/v1/admin/facilities").cookie(admin), Map.of("name", "F", "latitude", 100), 400);
        UUID id=facility("F");
        call(patch(facilityPath(id)).cookie(admin).header("If-Match", "\"0\""), Map.of("address", "Alamat"), 200);
        Map<String,Object> clear=new HashMap<>(); clear.put("address", null);
        call(patch(facilityPath(id)).cookie(admin).header("If-Match", "\"1\""), clear, 200);
        assertThat(jdbc.queryForObject("select address from facilities where id=?", String.class, id)).isNull();
    }

    @Test void facilityCannotDeactivateWhileActiveAssignmentsRemain() throws Exception {
        UUID f=facility("F"); assign(adminId,f,false);
        call(post(facilityPath(f)+"/deactivate").cookie(admin).header("If-Match", "\"0\""), null, 409);
        assertThat(jdbc.queryForObject("select active from facilities where id=?", Boolean.class,f)).isTrue();
    }

    @Test void exactLookupMasksIdentityAndHidesWorkflowAndClinicalInformation() throws Exception {
        UUID target=active("target@example.org"); role(target,"PATIENT"); role(target,"PROGRAM_MONITOR");
        UUID f=facility("F"); assign(target,f,false);
        JsonNode response=call(get("/api/v1/admin/users/lookup").cookie(admin).param("identity", " TARGET@EXAMPLE.ORG "), null,200);
        assertThat(response.path("userId").asText()).isEqualTo(target.toString());
        assertThat(response.path("email").asText()).contains("*").isNotEqualTo("target@example.org");
        assertThat(response.toString()).doesNotContain("PATIENT", "password", "token", "patientLink", "supporterCase");
        assertThat(response.path("roles").get(0).path("code").asText()).isEqualTo("PROGRAM_MONITOR");
        call(get("/api/v1/admin/users/lookup").cookie(admin).param("identity", "target"),null,400);
        call(get("/api/v1/admin/users/lookup").cookie(admin).param("identity", "1234567890123456"),null,400);
        mvc.perform(get("/api/v1/admin/users").cookie(admin)).andExpect(status().isNotFound());
        audited("ADMIN_USER_LOOKUP");
        call(get("/api/v1/admin/users/lookup").cookie(admin),null,400);
    }

    @Test void lookupRequiresTheRequestedIdentityToBeVerified() throws Exception {
        register("unverified@example.org", "081234567890");
        call(get("/api/v1/admin/users/lookup").cookie(admin).param("identity", "unverified@example.org"), null,404);
        verify(delivery.latest("PHONE_VERIFICATION"));
        call(get("/api/v1/admin/users/lookup").cookie(admin).param("identity", "unverified@example.org"), null,404);
        call(get("/api/v1/admin/users/lookup").cookie(admin).param("identity", "081234567890"), null,200);
    }

    @Test void facilityAdminLookupAndAssignmentsAreLimitedToOwnScope() throws Exception {
        UUID a=facility("A"), b=facility("B"), fa=active("facility-admin@example.org"), target=active("staff@example.org");
        assign(fa,a,false); role(fa,"FACILITY_ADMIN"); assign(target,a,false); assign(target,b,false);
        Cookie caller=login("facility-admin@example.org", PASSWORD,200);
        JsonNode response=call(get("/api/v1/admin/users/lookup").cookie(caller).param("identity", "staff@example.org"),null,200);
        assertThat(response.path("activeFacilities")).hasSize(1);
        assertThat(response.path("activeFacilities").get(0).path("id").asText()).isEqualTo(a.toString());
        assertThat(response.path("hasOtherFacilityAssignments").asBoolean()).isTrue(); assertThat(response.toString()).doesNotContain(b.toString());
        call(post(assignmentPath(b,target)).cookie(caller),Map.of("primary",false),403);
        call(delete(assignmentPath(b,target)).cookie(caller),null,403);
        call(post("/api/v1/admin/facilities").cookie(caller),Map.of("name","Forbidden"),403);
        call(post(rolePath(target,"TB_OFFICER")).cookie(caller),null,403);
        call(post(userPath(target)+"/suspend").cookie(caller).header("If-Match",userVersion(target)),null,403);
        call(delete(assignmentPath(a,fa)).cookie(caller),null,409);
    }

    @Test void assignmentsReactivateWithoutDeletionAndPrimarySwitchIsAtomic() throws Exception {
        UUID a=facility("A"),b=facility("B"), target=active("staff@example.org");
        call(post(assignmentPath(a,target)).cookie(admin),Map.of("primary",true),200);
        call(post(assignmentPath(b,target)).cookie(admin),Map.of("primary",true),200);
        assertThat(jdbc.queryForObject("select count(*) from user_facilities where user_id=? and is_primary and active",Integer.class,target)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select is_primary from user_facilities where user_id=? and facility_id=?",Boolean.class,target,a)).isFalse();
        call(delete(assignmentPath(b,target)).cookie(admin),null,200);
        assertThat(jdbc.queryForObject("select active from user_facilities where user_id=? and facility_id=?",Boolean.class,target,b)).isFalse();
        call(post(assignmentPath(b,target)).cookie(admin),Map.of("primary",false),200);
        assertThat(jdbc.queryForObject("select count(*) from user_facilities where user_id=?",Integer.class,target)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select active from user_facilities where user_id=? and facility_id=?",Boolean.class,target,b)).isTrue();
        audited("FACILITY_USER_ASSIGNED","FACILITY_USER_REMOVED","PRIMARY_FACILITY_CHANGED");
    }

    @Test void rolesAreGlobalIdempotentAndOperationalRolesRequireFacility() throws Exception {
        UUID target=active("staff@example.org");
        call(post(rolePath(target,"TB_OFFICER")).cookie(admin),null,409);
        UUID f=facility("F"); call(post(assignmentPath(f,target)).cookie(admin),Map.of(),200);
        call(post(rolePath(target,"TB_OFFICER")).cookie(admin),null,200); call(post(rolePath(target,"TB_OFFICER")).cookie(admin),null,200);
        assertThat(jdbc.queryForObject("select count(*) from user_roles where user_id=?",Integer.class,target)).isEqualTo(1);
        call(delete(assignmentPath(f,target)).cookie(admin),null,200);
        assertThat(jdbc.queryForObject("select count(*) from user_roles where user_id=?",Integer.class,target)).isEqualTo(1);
        call(delete(rolePath(target,"TB_OFFICER")).cookie(admin),null,200); call(delete(rolePath(target,"TB_OFFICER")).cookie(admin),null,200);
        assertThat(jdbc.queryForObject("select count(*) from user_roles where user_id=?",Integer.class,target)).isZero();
        audited("ROLE_ASSIGNED","ROLE_REMOVED");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='ROLE_ASSIGNED' and entity_id=?",Integer.class,target)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='ROLE_REMOVED' and entity_id=?",Integer.class,target)).isEqualTo(1);
    }

    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER"})
    void workflowRolesCannotBeChangedManually(String role) throws Exception {
        UUID target=active("target@example.org");
        call(post(rolePath(target,role)).cookie(admin),null,400); call(delete(rolePath(target,role)).cookie(admin),null,400);
    }

    @Test void lastSystemAdminCannotBeRemovedSuspendedOrDisabled() throws Exception {
        call(delete(rolePath(adminId,"SYSTEM_ADMIN")).cookie(admin),null,409);
        call(post(userPath(adminId)+"/suspend").cookie(admin).header("If-Match",userVersion(adminId)),null,409);
        call(post(userPath(adminId)+"/disable").cookie(admin).header("If-Match",userVersion(adminId)),null,409);
    }

    @Test void statusTransitionsRequireVersionsAndRevokeAllSessions() throws Exception {
        UUID target=active("target@example.org"); Cookie first=login("target@example.org",PASSWORD,200); login("target@example.org",PASSWORD,200);
        call(post(userPath(target)+"/suspend").cookie(admin),null,428);
        call(post(userPath(target)+"/suspend").cookie(admin).header("If-Match","\"999\""),null,409);
        JsonNode lookup=call(get("/api/v1/admin/users/lookup").cookie(admin).param("identity","target@example.org"),null,200);
        assertThat(lookup.has("version")).isTrue();
        JsonNode suspended=call(post(userPath(target)+"/suspend").cookie(admin).header("If-Match","\""+lookup.path("version").asLong()+"\""),null,200);
        assertThat(suspended.path("status").asText()).isEqualTo("SUSPENDED");
        assertThat(jdbc.queryForObject("select count(*) from user_sessions where user_id=? and revoked_at is null",Integer.class,target)).isZero();
        mvc.perform(get("/api/v1/me").cookie(first)).andExpect(status().isUnauthorized());
        call(post(userPath(target)+"/suspend").cookie(admin).header("If-Match",userVersion(target)),null,409);
        call(post(userPath(target)+"/reactivate").cookie(admin).header("If-Match",userVersion(target)),null,200);
        login("target@example.org",PASSWORD,200);
        call(post(userPath(target)+"/disable").cookie(admin).header("If-Match",userVersion(target)),null,200);
        call(post(userPath(target)+"/reactivate").cookie(admin).header("If-Match",userVersion(target)),null,409);
        audited("USER_SUSPENDED","USER_REACTIVATED","USER_DISABLED");
    }

    @Test void pendingCannotBeActivatedByAdminAndUnverifiedCannotBeReactivated() throws Exception {
        UUID target=register("pending@example.org",null);
        call(post(userPath(target)+"/reactivate").cookie(admin).header("If-Match",userVersion(target)),null,409);
        jdbc.update("update users set status='SUSPENDED',email_verified_at=null,version=version+1 where id=?",target);
        call(post(userPath(target)+"/reactivate").cookie(admin).header("If-Match",userVersion(target)),null,400);
    }

    @Test void resendIsGenericAndInvalidatesOldSamePurposeTokens() throws Exception {
        UUID target=register("pending@example.org",null); String old=delivery.latest("EMAIL_VERIFICATION");
        JsonNode known=call(post("/api/v1/auth/verification/resend"),Map.of("identity","pending@example.org"),202);
        String newer=delivery.latest("EMAIL_VERIFICATION");
        JsonNode unknown=call(post("/api/v1/auth/verification/resend"),Map.of("identity","unknown@example.org"),202);
        assertThat(known).isEqualTo(unknown); assertThat(known.toString()).doesNotContain(newer,old,target.toString());
        call(post("/api/v1/auth/verify"),Map.of("token",old),400); verify(newer);
        int issued=delivery.messages.size(); call(post("/api/v1/auth/verification/resend"),Map.of("identity","pending@example.org"),202);
        assertThat(delivery.messages).hasSize(issued);
        audited("VERIFICATION_RESENT");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='VERIFICATION_RESENT'",Integer.class)).isEqualTo(1);
    }

    @Test void resetRequestsAreGenericAndOnlyActiveVerifiedIdentitiesReceiveTokens() throws Exception {
        UUID active=active("target@example.org"); UUID pending=register("pending@example.org",null);
        JsonNode known=call(post("/api/v1/auth/password-reset/request"),Map.of("identity","target@example.org"),202);
        int issued=delivery.messages.size();
        JsonNode unknown=call(post("/api/v1/auth/password-reset/request"),Map.of("identity","unknown@example.org"),202);
        JsonNode notVerified=call(post("/api/v1/auth/password-reset/request"),Map.of("identity","pending@example.org"),202);
        assertThat(known).isEqualTo(unknown).isEqualTo(notVerified); assertThat(delivery.messages).hasSize(issued);
        jdbc.update("update users set status='SUSPENDED',version=version+1 where id=?",active);
        call(post("/api/v1/auth/password-reset/request"),Map.of("identity","target@example.org"),202); assertThat(delivery.messages).hasSize(issued);
    }

    @Test void passwordResetIsOneTimeChangesPasswordAndRevokesSessions() throws Exception {
        UUID target=active("target@example.org"); Cookie oldSession=login("target@example.org",PASSWORD,200);
        call(post("/api/v1/auth/password-reset/request"),Map.of("identity","target@example.org"),202); String token=delivery.latest("PASSWORD_RESET");
        confirm(token,"New recovery password 123!",204); confirm(token,"Another password 123!",400);
        mvc.perform(get("/api/v1/me").cookie(oldSession)).andExpect(status().isUnauthorized());
        login("target@example.org",PASSWORD,401); login("target@example.org","New recovery password 123!",200);
        assertThat(jdbc.queryForList("select metadata::text from audit_logs",String.class).toString()).doesNotContain(token,"New recovery password 123!");
        assertThat(jdbc.queryForObject("select password_hash from users where id=?",String.class,target)).startsWith("{bcrypt-sha256}");
        audited("PASSWORD_RESET_REQUESTED","PASSWORD_RESET_COMPLETED");
    }

    @Test void expiredWrongPurposeAndOldResetTokensAreRejected() throws Exception {
        active("target@example.org"); String verification=delivery.latest("EMAIL_VERIFICATION");
        confirm(verification,"New recovery password 123!",400);
        call(post("/api/v1/auth/password-reset/request"),Map.of("identity","target@example.org"),202); String old=delivery.latest("PASSWORD_RESET");
        call(post("/api/v1/auth/password-reset/request"),Map.of("identity","target@example.org"),202); String latest=delivery.latest("PASSWORD_RESET");
        confirm(old,"New recovery password 123!",400);
        jdbc.update("update user_verification_tokens set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where purpose='PASSWORD_RESET' and used_at is null");
        confirm(latest,"New recovery password 123!",400);
        confirm("invalid","short",400);
    }

    @Test void deliveryUnavailableIsIdentityIndependentIncludingDuplicateRegistration() throws Exception {
        active("target@example.org"); delivery.available.set(false);
        for(String identity:List.of("target@example.org","unknown@example.org")) {
            for(String path:List.of("/api/v1/auth/verification/resend","/api/v1/auth/password-reset/request")) {
                JsonNode response=call(post(path),Map.of("identity",identity),503);
                assertThat(response.path("code").asText()).isEqualTo("VERIFICATION_DELIVERY_UNAVAILABLE");
            }
            JsonNode registered=call(post("/api/v1/auth/register"),Map.of("email",identity,"password",PASSWORD),503);
            assertThat(registered.path("code").asText()).isEqualTo("VERIFICATION_DELIVERY_UNAVAILABLE");
        }
    }

    @Test void nonAdminsCannotUseAdministrativeEndpointsAndCsrfRemainsRequired() throws Exception {
        active("ordinary@example.org"); Cookie ordinary=login("ordinary@example.org",PASSWORD,200);
        call(post("/api/v1/admin/facilities").cookie(ordinary),Map.of("name","F"),403);
        call(get("/api/v1/admin/users/lookup").cookie(ordinary).param("identity","admin@example.org"),null,403);
        mvc.perform(post("/api/v1/admin/facilities").cookie(admin).contentType("application/json").content("{\"name\":\"F\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(options("/api/v1/admin/facilities/"+UUID.randomUUID()).header("Origin","https://client.example")
                .header("Access-Control-Request-Method","PATCH")).andExpect(status().isOk());
    }

    @ParameterizedTest @ValueSource(strings={"OPEN","DIAGNOSED","CLOSED","CANCELLED","CONVERTED_TO_CASE"})
    void clinicalRegistrationScopeExcludesHistoricalOnlyEpisodes(String status) throws Exception {
        UUID facility=facility("F"), officer=active("officer@example.org"); assign(officer,facility,false); role(officer,"TB_OFFICER");
        var actor=sessions.resolve(login("officer@example.org",PASSWORD,200).getValue()).orElseThrow();
        UUID patient=jdbc.queryForObject("insert into patients(full_name) values ('Pasien uji') returning id",UUID.class);
        jdbc.update("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,current_date,?)",patient,facility,status);
        if(List.of("OPEN","DIAGNOSED").contains(status)) assertThatCode(() -> clinicalScope(actor,patient)).doesNotThrowAnyException();
        else assertThatThrownBy(() -> clinicalScope(actor,patient)).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
    }

    @ParameterizedTest @ValueSource(strings={"ACTIVE","REFERRED","TRANSFERRED","COMPLETED","CLOSED","CANCELLED"})
    void clinicalCaseScopeRequiresCurrentActiveOrReferredCase(String status) throws Exception {
        UUID facility=facility("F"), officer=active("officer@example.org"); assign(officer,facility,false); role(officer,"TB_OFFICER");
        var actor=sessions.resolve(login("officer@example.org",PASSWORD,200).getValue()).orElseThrow();
        UUID patient=jdbc.queryForObject("insert into patients(full_name) values ('Pasien uji') returning id",UUID.class);
        UUID reg=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,current_date,'CLOSED') returning id",UUID.class,patient,facility);
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date) values (?,current_date) returning id",UUID.class,reg);
        jdbc.update("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id,status) values (?,?,?,?)",reg,diagnosis,facility,status);
        if(List.of("ACTIVE","REFERRED").contains(status)) assertThatCode(() -> clinicalScope(actor,patient)).doesNotThrowAnyException();
        else assertThatThrownBy(() -> clinicalScope(actor,patient)).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
    }

    private void clinicalScope(id.tbcall.authorization.CurrentActor actor, UUID patient) {
        scopes.requireOfficerClinicalPatientScope(actor,"PATIENT_READ",patient);
    }

    @Test void historicalLinkScopeIsPreservedButDoesNotGrantClinicalAccess() throws Exception {
        UUID facility=facility("F"), officer=active("officer@example.org"); assign(officer,facility,false); role(officer,"TB_OFFICER");
        var actor=sessions.resolve(login("officer@example.org",PASSWORD,200).getValue()).orElseThrow();
        UUID patient=jdbc.queryForObject("insert into patients(full_name) values ('Pasien uji') returning id",UUID.class);
        jdbc.update("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,current_date,'CLOSED')",patient,facility);
        assertThatCode(() -> scopes.requireOfficerPatientLinkScope(actor,"PATIENT_LINK_VERIFY",patient)).doesNotThrowAnyException();
        assertThatThrownBy(() -> clinicalScope(actor,patient)).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
        jdbc.update("update user_facilities set active=false where user_id=?",officer);
        var unassigned=sessions.resolve(login("officer@example.org",PASSWORD,200).getValue()).orElseThrow();
        assertThatThrownBy(() -> clinicalScope(unassigned,patient)).isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
        assertThatThrownBy(() -> clinicalScope(sessions.resolve(admin.getValue()).orElseThrow(),patient))
                .isInstanceOf(id.tbcall.application.common.ApplicationFailure.class);
    }

    @Test void v10PermissionGrantAndTokenIndexAreExact() {
        assertThat(jdbc.queryForList("select r.code from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where p.code='USER_ACCOUNT_MANAGE'",String.class))
                .containsExactly("SYSTEM_ADMIN");
        assertThat(jdbc.queryForObject("select name from permissions where code='USER_ACCOUNT_MANAGE'",String.class))
                .isEqualTo("Mengelola status akun pengguna");
        assertThat(jdbc.queryForList("select indexdef from pg_indexes where tablename='user_verification_tokens'",String.class))
                .anyMatch(def -> def.contains("(user_id, purpose, used_at, expires_at)"));
    }

    @Test void concurrentSystemAdminRoleRemovalLeavesOneUsableAdministrator() throws Exception {
        UUID second=active("second@example.org"); role(second,"SYSTEM_ADMIN");
        var actor=sessions.resolve(admin.getValue()).orElseThrow();
        assertThat(race(() -> userAdministration.removeRole(actor,adminId,"SYSTEM_ADMIN"),
                () -> userAdministration.removeRole(actor,second,"SYSTEM_ADMIN"))).containsExactlyInAnyOrder(200,409);
        assertThat(jdbc.queryForObject("select count(*) from user_roles ur join roles r on r.id=ur.role_id join users u on u.id=ur.user_id where r.code='SYSTEM_ADMIN' and u.status='ACTIVE'",Integer.class)).isEqualTo(1);
    }

    @Test void concurrentSystemAdminSuspensionLeavesOneUsableAdministrator() throws Exception {
        UUID second=active("second@example.org"); role(second,"SYSTEM_ADMIN");
        var actor=sessions.resolve(admin.getValue()).orElseThrow(); String firstVersion=userVersion(adminId),secondVersion=userVersion(second);
        assertThat(race(() -> userAdministration.suspend(actor,adminId,firstVersion),
                () -> userAdministration.suspend(actor,second,secondVersion))).containsExactlyInAnyOrder(200,409);
        assertThat(jdbc.queryForObject("select count(*) from users where status='ACTIVE'",Integer.class)).isEqualTo(1);
    }

    @Test void concurrentPrimaryChangesRemainUnique() throws Exception {
        UUID target=active("staff@example.org"),a=facility("A"),b=facility("B");
        var actor=sessions.resolve(admin.getValue()).orElseThrow();
        assertThat(race(() -> memberships.assign(actor,a,target,true), () -> memberships.assign(actor,b,target,true))).containsOnly(200);
        assertThat(jdbc.queryForObject("select count(*) from user_facilities where user_id=? and active",Integer.class,target)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from user_facilities where user_id=? and active and is_primary",Integer.class,target)).isEqualTo(1);
    }

    @Test void facilityDeactivationCannotRaceAnAssignmentIntoAnInactiveFacility() throws Exception {
        UUID target=active("staff@example.org"),f=facility("F"); var actor=sessions.resolve(admin.getValue()).orElseThrow();
        assertThat(race(() -> memberships.assign(actor,f,target,false), () -> facilities.deactivate(actor,f,"\"0\"")))
                .containsExactlyInAnyOrder(200,409);
        assertThat(jdbc.queryForObject("select count(*) from user_facilities uf join facilities f on f.id=uf.facility_id where uf.active and not f.active",Integer.class)).isZero();
    }

    @Test void concurrentResetConsumptionSucceedsExactlyOnce() throws Exception {
        active("target@example.org"); recovery.requestReset("target@example.org"); String token=delivery.latest("PASSWORD_RESET");
        var request=new id.tbcall.application.auth.AuthDtos.ResetConfirmRequest(token,"Concurrent password 123!");
        assertThat(race(() -> { recovery.confirmReset(request); return null; }, () -> { recovery.confirmReset(request); return null; }))
                .containsExactlyInAnyOrder(200,400);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='PASSWORD_RESET_COMPLETED'",Integer.class)).isEqualTo(1);
    }

    @Test void concurrentResendsAndVerificationUseConsistentLockOrder() throws Exception {
        UUID user=register("pending@example.org",null); String old=delivery.latest("EMAIL_VERIFICATION");
        var result=race(() -> recovery.resend("pending@example.org"), () -> auth.verify(old));
        assertThat(result.get(0)).isEqualTo(200); assertThat(result.get(1)).isIn(200,400);
        assertThat(jdbc.queryForObject("select count(*) from user_verification_tokens where user_id=? and used_at is null",Integer.class,user))
                .isEqualTo(result.get(1)==200 ? 0 : 1);
    }

    @Test void concurrentResendsLeaveExactlyOneUsableVerificationToken() throws Exception {
        UUID user=register("pending@example.org",null);
        assertThat(race(() -> recovery.resend("pending@example.org"), () -> recovery.resend("pending@example.org"))).containsOnly(200);
        assertThat(jdbc.queryForObject("select count(*) from user_verification_tokens where user_id=? and purpose='EMAIL_VERIFICATION' and used_at is null",Integer.class,user)).isEqualTo(1);
        verify(delivery.latest("EMAIL_VERIFICATION"));
    }

    @Test void phoneResendInvalidatesOnlyPhonePurposeAndResetRequiresRequestedVerifiedIdentity() throws Exception {
        UUID target=register("target@example.org","081234567890"); String emailToken=delivery.latest("EMAIL_VERIFICATION"),oldPhone=delivery.latest("PHONE_VERIFICATION");
        call(post("/api/v1/auth/verification/resend"),Map.of("identity","081234567890"),202);
        String phoneToken=delivery.latest("PHONE_VERIFICATION"); verify(emailToken);
        call(post("/api/v1/auth/verify"),Map.of("token",oldPhone),400);
        int count=delivery.messages.size(); call(post("/api/v1/auth/password-reset/request"),Map.of("identity","081234567890"),202);
        assertThat(delivery.messages).hasSize(count); verify(phoneToken);
        call(post("/api/v1/auth/password-reset/request"),Map.of("identity","081234567890"),202);
        assertThat(delivery.latest("PASSWORD_RESET")).hasSize(43);
        jdbc.update("update users set status='DISABLED',version=version+1 where id=?",target);
        confirm(delivery.latest("PASSWORD_RESET"),"Disabled password 123!",400);
        count=delivery.messages.size(); call(post("/api/v1/auth/verification/resend"),Map.of("identity","target@example.org"),202);
        call(post("/api/v1/auth/password-reset/request"),Map.of("identity","target@example.org"),202); assertThat(delivery.messages).hasSize(count);
    }

    private List<Integer> race(Callable<?> first,Callable<?> second) throws Exception {
        CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var futures=List.of(first,second).stream().map(task -> executor.submit(() -> {
                ready.countDown(); if(!start.await(10,TimeUnit.SECONDS)) throw new AssertionError("Start barrier timeout");
                try { task.call(); return 200; } catch(id.tbcall.application.common.ApplicationFailure failure) { return failure.status(); }
            })).toList();
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue(); start.countDown();
            return List.of(futures.get(0).get(30,TimeUnit.SECONDS),futures.get(1).get(30,TimeUnit.SECONDS));
        }
    }

    private JsonNode call(MockHttpServletRequestBuilder request,Object body,int expected) throws Exception {
        if(body!=null) request.contentType("application/json").content(json.writeValueAsString(body));
        MvcResult result=mvc.perform(request.with(csrf())).andExpect(status().is(expected)).andReturn();
        return result.getResponse().getContentAsString().isEmpty() ? json.nullNode() : json.readTree(result.getResponse().getContentAsString());
    }
    private UUID register(String email,String phone) throws Exception {
        Map<String,Object> body=new HashMap<>(); body.put("email",email);body.put("phone",phone);body.put("password",PASSWORD);
        return UUID.fromString(call(post("/api/v1/auth/register"),body,201).path("id").asText());
    }
    private UUID active(String email) throws Exception { UUID user=register(email,null); verify(delivery.latest("EMAIL_VERIFICATION")); return user; }
    private void verify(String token) throws Exception { call(post("/api/v1/auth/verify"),Map.of("token",token),200); }
    private Cookie login(String identity,String password,int expected) throws Exception {
        MvcResult result=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("identity",identity,"password",password)))).andExpect(status().is(expected)).andReturn();
        return result.getResponse().getCookie("TBCALL_SESSION");
    }
    private void confirm(String token,String password,int expected) throws Exception {
        call(post("/api/v1/auth/password-reset/confirm"),Map.of("token",token,"newPassword",password),expected);
    }
    private UUID facility(String name) { return jdbc.queryForObject("insert into facilities(name) values (?) returning id",UUID.class,name); }
    private void assign(UUID user,UUID facility,boolean primary) { jdbc.update("insert into user_facilities(user_id,facility_id,is_primary) values (?,?,?)",user,facility,primary); }
    private void role(UUID user,String role) { jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",user,role); }
    private String userVersion(UUID user) { return "\""+jdbc.queryForObject("select version from users where id=?",Long.class,user)+"\""; }
    private String facilityPath(UUID id) { return "/api/v1/admin/facilities/"+id; }
    private void audited(String... actions) {
        for(String action:actions) assertThat(jdbc.queryForObject("select count(*) from audit_logs where action=?",Integer.class,action))
                .as("audit action %s",action).isGreaterThan(0);
    }
    private String assignmentPath(UUID facility,UUID user) { return facilityPath(facility)+"/users/"+user; }
    private String userPath(UUID user) { return "/api/v1/admin/users/"+user; }
    private String rolePath(UUID user,String role) { return userPath(user)+"/roles/"+role; }
}
