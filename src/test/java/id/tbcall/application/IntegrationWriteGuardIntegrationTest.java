package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
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

@SpringBootTest(properties = {"tbcall.security.production=false", "tbcall.monitoring.scheduler-enabled=false"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class IntegrationWriteGuardIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl); r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords; @Autowired Clock clock;
    final JsonMapper json = JsonMapper.builder().build();
    static final String PASSWORD = "Authority write test password 123!"; static String hash;
    UUID system, facility, otherFacility, patient, registration, tbCase, treatment, lab, referral, contact, investigation, tpt, plan, event;
    Cookie caller;

    @BeforeEach void setup() throws Exception {
        if (hash == null) hash = passwords.encode(PASSWORD);
        jdbc.execute("truncate external_source_authorities,integration_conflicts,external_identifiers,sync_runs,users,patients,facilities restart identity cascade");
        system = jdbc.queryForObject("select id from external_systems where code='SITB'", UUID.class);
        facility = id("insert into facilities(name) values ('Owner') returning id"); otherFacility = id("insert into facilities(name) values ('Other') returning id");
        user("officer@example.org", "TB_OFFICER", facility); caller = login("officer@example.org");
        patient = id("insert into patients(full_name,nik,birth_date,sex_code,citizenship) values ('Patient','1234567890123456','1980-01-01','LAKI_LAKI','WNI') returning id");
        registration = id("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,current_date-10) returning id", patient, facility);
        tbCase = id("insert into tb_cases(registration_id,current_facility_id,case_category_code,previous_treatment_category_code) values (?,?,'TB_SO','BARU') returning id", registration, facility);
        treatment = id("insert into treatments(case_id,facility_id,start_date,status) values (?,?,current_date-5,'ACTIVE') returning id", tbCase, facility);
        lab = id("insert into lab_requests(registration_id,requesting_facility_id,testing_facility_id,referral_type,requested_at,request_reason_code) values (?,?,?,'INTERNAL',now()-interval '1 hour','DIAGNOSIS') returning id", registration, facility, facility);
        jdbc.update("insert into lab_request_tests(lab_request_id,test_type_code) values (?,'TCM')", lab);
        referral = id("insert into referrals(case_id,treatment_id,referral_type,source_facility_id,destination_facility_id,sent_at) values (?,?,'TREATMENT_TRANSFER',?,?,now()-interval '1 hour') returning id", tbCase, treatment, facility, otherFacility);
        contact = id("insert into contacts(index_case_id,full_name) values (?,'Contact') returning id", tbCase);
        jdbc.update("insert into contact_investigations(contact_id,workflow_type,source_facility_id,requested_at,investigated_at,status,active_tb_excluded,tpt_eligible,eligibility_assessed_at) values (?,'INTERNAL',?,now()-interval '2 days',now()-interval '1 day','COMPLETED',true,true,now()-interval '1 day')", contact, facility);
        investigation = id("insert into contact_investigations(contact_id,workflow_type,source_facility_id,requested_at,status) values (?,'INTERNAL',?,now()-interval '1 hour','IN_PROGRESS') returning id", contact, facility);
        tpt = id("insert into preventive_treatments(contact_id,index_case_id,facility_id,start_date,regimen_description) values (?,?,?,current_date-1,'Clinician-entered manual TPT') returning id", contact, tbCase, facility);
        plan = id("insert into monitoring_plans(treatment_id,start_date) values (?,current_date-1) returning id", treatment);
        event = id("insert into monitoring_events(monitoring_plan_id,event_type,scheduled_at,due_at) values (?,'CLINICAL_REVIEW',now()+interval '1 day',now()+interval '2 days') returning id", plan);
    }

    static Stream<Arguments> writes() {
        return Stream.of("CLINICAL", "LABORATORY", "REFERRAL", "CONTACT", "INVESTIGATION", "TPT", "MONITORING")
                .flatMap(f -> Stream.of("MATCHING", "IDENTIFIER_ONLY", "RELEASED", "WRONG_SCOPE", "PARENT")
                        .map(mode -> Arguments.of(f, mode)));
    }

    @ParameterizedTest @MethodSource("writes")
    void realWriteRoutesUseExactAuthorityAndPreserveRollback(String family, String mode) throws Exception {
        UUID target = target(family); String type = type(family), scope = scope(family);
        if (family.equals("REFERRAL")) jdbc.update("update tb_cases set status='REFERRED' where id=?", tbCase);
        if (mode.equals("IDENTIFIER_ONLY")) jdbc.update("insert into external_identifiers(external_system_id,entity_type,entity_id,external_id) values (?,?,?,'external-only')", system, type, target);
        else if (mode.equals("PARENT")) {
            String parentType = family.equals("MONITORING") ? "TREATMENT" : family.equals("TPT") ? "CONTACT" : "TB_CASE";
            UUID parent = family.equals("MONITORING") ? treatment : family.equals("TPT") ? contact : tbCase;
            authority(parentType, parent, family.equals("MONITORING") ? "CLINICAL" : scope);
        } else {
            UUID authority = authority(type, target, mode.equals("WRONG_SCOPE") ? (scope.equals("CLINICAL") ? "MONITORING" : "CLINICAL") : scope);
            if (mode.equals("RELEASED")) jdbc.update("update external_source_authorities set released_at=effective_at where id=?", authority);
        }
        String before = row(table(family), target); long auditBefore = count("audit_logs");
        var response = call(command(family).header("If-Match", "\"0\""), input(family), mode.equals("MATCHING") ? 409 : 200);
        if (mode.equals("MATCHING")) {
            assertThat(response.path("code").asText()).isEqualTo("SOURCE_AUTHORITY_CONFLICT");
            assertThat(row(table(family), target)).isEqualTo(before);
            assertThat(count("audit_logs")).isEqualTo(auditBefore);
        } else assertThat(row(table(family), target)).isNotEqualTo(before);
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void monitoringEventChecksItsPlanNotTreatmentOrEvent(boolean matchingPlan) throws Exception {
        authority(matchingPlan ? "MONITORING_PLAN" : "MONITORING_EVENT", matchingPlan ? plan : event, "MONITORING");
        var response = call(patch("/api/v1/monitoring-events/" + event).header("If-Match", "\"0\""),
                Map.of("scheduledAt", OffsetDateTime.now(clock).plusDays(3).toString(), "dueAt", OffsetDateTime.now(clock).plusDays(4).toString()), matchingPlan ? 409 : 200);
        if (matchingPlan) assertThat(response.path("code").asText()).isEqualTo("SOURCE_AUTHORITY_CONFLICT");
    }

    @ParameterizedTest @ValueSource(strings = {"PATIENT", "TREATMENT_SUPPORTER"})
    void existingAdherenceRoutesRemainWritableUnderTreatmentClinicalAuthority(String role) throws Exception {
        authority("TREATMENT", treatment, "CLINICAL");
        UUID user = user("reporter@example.org", role, null);
        String route;
        if (role.equals("PATIENT")) {
            jdbc.update("insert into patient_user_links(user_id,patient_id,relationship_type,verification_status) values (?,?,'SELF','VERIFIED')", user, patient);
            route = "/api/v1/me/treatment/dose-events";
        } else {
            jdbc.update("insert into patient_supporters(case_id,supporter_type,full_name,linked_user_id,active) values (?,'PMO','Supporter',?,true)", tbCase, user);
            route = "/api/v1/me/supporting-cases/" + tbCase + "/dose-events";
        }
        caller = login("reporter@example.org");
        call(post(route), Map.of("scheduledDate", LocalDate.now(clock).toString(), "status", "TAKEN_SELF_REPORTED"), 201);
        assertThat(count("dose_events")).isEqualTo(1);
    }

    @Test void externalLaboratoryFacilityDoesNotConferAuthority() throws Exception {
        jdbc.update("update lab_requests set referral_type='EXTERNAL',testing_facility_id=? where id=?", otherFacility, lab);
        call(post("/api/v1/lab-requests/" + lab + "/cancel").header("If-Match", "\"0\""), Map.of(), 200);
    }

    private MockHttpServletRequestBuilder command(String family) {
        return switch (family) {
            case "CLINICAL" -> patch("/api/v1/patients/" + patient);
            case "LABORATORY" -> post("/api/v1/lab-requests/" + lab + "/cancel");
            case "REFERRAL" -> post("/api/v1/referrals/" + referral + "/cancel");
            case "CONTACT" -> patch("/api/v1/contacts/" + contact);
            case "INVESTIGATION" -> post("/api/v1/contact-investigations/" + investigation + "/complete");
            case "TPT" -> patch("/api/v1/preventive-treatments/" + tpt);
            case "MONITORING" -> patch("/api/v1/monitoring-plans/" + plan);
            default -> throw new IllegalArgumentException(family);
        };
    }
    private Map<String, Object> input(String family) {
        return switch (family) {
            case "CLINICAL", "CONTACT" -> Map.of("fullName", "Changed name");
            case "LABORATORY" -> Map.of();
            case "REFERRAL" -> Map.of("cancelReason", "Cancelled by source officer");
            case "INVESTIGATION" -> Map.of("activeTbExcluded", true, "tptEligible", false);
            default -> Map.of("notes", "Changed notes");
        };
    }
    private UUID target(String family) { return switch (family) {
        case "CLINICAL" -> patient; case "LABORATORY" -> lab; case "REFERRAL" -> referral; case "CONTACT" -> contact;
        case "INVESTIGATION" -> investigation; case "TPT" -> tpt; case "MONITORING" -> plan; default -> throw new IllegalArgumentException(family);
    }; }
    private String type(String family) { return switch (family) {
        case "CLINICAL" -> "PATIENT"; case "LABORATORY" -> "LAB_REQUEST"; case "INVESTIGATION" -> "CONTACT_INVESTIGATION";
        case "TPT" -> "PREVENTIVE_TREATMENT"; case "MONITORING" -> "MONITORING_PLAN"; default -> family;
    }; }
    private String table(String family) { return switch (family) {
        case "CLINICAL" -> "patients"; case "LABORATORY" -> "lab_requests"; case "REFERRAL" -> "referrals";
        case "CONTACT" -> "contacts"; case "INVESTIGATION" -> "contact_investigations"; case "TPT" -> "preventive_treatments";
        case "MONITORING" -> "monitoring_plans"; default -> throw new IllegalArgumentException(family);
    }; }
    private String scope(String family) { return Set.of("CONTACT", "INVESTIGATION", "TPT").contains(family) ? "CONTACT_TPT" : family; }
    private UUID authority(String type, UUID target, String scope) { return id("insert into external_source_authorities(external_system_id,entity_type,entity_id,authority_scope) values (?,?,?,?) returning id", system, type, target, scope); }
    private String row(String table, UUID target) { return jdbc.queryForObject("select to_jsonb(t)::text from " + table + " t where id=?", String.class, target); }
    private long count(String table) { return jdbc.queryForObject("select count(*) from " + table, Long.class); }
    private UUID id(String sql, Object... values) { return jdbc.queryForObject(sql, UUID.class, values); }
    private UUID user(String email, String role, UUID facility) {
        UUID user = id("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id", email, hash);
        assertThat(jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?", user, role)).isEqualTo(1);
        if (facility != null) jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)", user, facility);
        return user;
    }
    private Cookie login(String email) throws Exception {
        Cookie cookie = mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("identity", email, "password", PASSWORD)))).andExpect(status().isOk())
                .andReturn().getResponse().getCookie("TBCALL_SESSION");
        assertThat(cookie).isNotNull(); return cookie;
    }
    private JsonNode call(MockHttpServletRequestBuilder request, Map<String, Object> body, int expected) throws Exception {
        var response = mvc.perform(request.cookie(caller).with(csrf()).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().is(expected)).andReturn().getResponse(); return json.readTree(response.getContentAsString());
    }
}
