package id.tbcall.application;

import java.util.*;
import java.util.concurrent.*;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false", "tbcall.security.expose-verification-tokens=true",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=id.tbcall.application.AccountOnboardingIntegrationTest$LookupSqlInspector"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class AccountOnboardingIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl); r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.beans.factory.config.AutowireCapableBeanFactory beans;
    @Autowired id.tbcall.application.auth.SessionService sessions;
    private final JsonMapper json=JsonMapper.builder().build();
    private static final String PASSWORD="Valid password 123!";
    private UUID actor,facility,patient,tbCase,supporter;
    private Cookie officer;
    public static class LookupSqlInspector implements org.hibernate.resource.jdbc.spi.StatementInspector {
        static final java.util.concurrent.atomic.AtomicReference<String> actorCount=new java.util.concurrent.atomic.AtomicReference<>();
        public String inspect(String sql) {
            if(sql.startsWith("select count(*) from (select 1 from audit_logs") && !sql.contains("entity_type"))actorCount.set(sql);
            return sql;
        }
    }
    @BeforeEach void setup() throws Exception {
        jdbc.execute("truncate users, patients, facilities restart identity cascade");
        actor=active("officer@example.org"); assign(actor,"TB_OFFICER");
        facility=jdbc.queryForObject("insert into facilities(name) values ('Test facility') returning id",UUID.class);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",actor,facility);
        patient=patient();
        UUID registration=jdbc.queryForObject("select id from tb_registrations where patient_id=?",UUID.class,patient);
        UUID diagnosis=jdbc.queryForObject("insert into diagnoses(registration_id,diagnosis_date) values (?,current_date) returning id",UUID.class,registration);
        tbCase=jdbc.queryForObject("insert into tb_cases(registration_id,confirming_diagnosis_id,current_facility_id) values (?,?,?) returning id",UUID.class,registration,diagnosis,facility);
        supporter=jdbc.queryForObject("insert into patient_supporters(case_id,supporter_type,full_name,phone,address,notes) values (?,'PMO','Test supporter','081234567890','private address','private notes') returning id",UUID.class,tbCase);
        officer=session("officer@example.org");
    }
    @Test void absentPatientStateHasNoEtagAndExistingStateUsesLinkRow() throws Exception {
        MvcResult empty=read(patientPath(),200); assertThat(body(empty).path("link").isNull()).isTrue();
        assertThat(empty.getResponse().getHeader("ETag")).isNull();
        UUID user=active("target@example.org");
        MvcResult missing=read(patientPath()+"/precondition?userId="+user,200);
        assertThat(body(missing).path("pair").isNull()).isTrue(); assertThat(missing.getResponse().getHeader("ETag")).isNull();
        call(post(patientPath()),Map.of("userId",user),201);
        MvcResult state=read(patientPath(),200);
        assertThat(state.getResponse().getHeader("ETag")).isEqualTo("\"0\"");
        assertThat(body(state).path("link").path("maskedAccount").path("maskedEmail").asText()).isEqualTo("t***@example.org");
        assertThat(state.getResponse().getContentAsString()).doesNotContain("target@example.org","password","roles");
        assertThat(body(read(patientPath()+"/precondition?userId="+user,200)).path("pair").path("verificationStatus").asText()).isEqualTo("VERIFIED");
    }
    @ParameterizedTest @ValueSource(strings={"PENDING","REVOKED","REJECTED"})
    void pairReadIsAuthoritativeForHistoricalRelinking(String state) throws Exception {
        UUID user=active("target@example.org");
        UUID link=jdbc.queryForObject("insert into patient_user_links(patient_id,user_id,relationship_type,verification_status,version) values (?,?,'SELF',?,7) returning id",UUID.class,patient,user,state);
        MvcResult result=read(patientPath()+"/precondition?userId="+user,200);
        assertThat(result.getResponse().getHeader("ETag")).isEqualTo("\"7\"");
        assertThat(body(result).path("pair").path("id").asText()).isEqualTo(link.toString());
        assertThat(body(result).path("pair").path("verificationStatus").asText()).isEqualTo(state);
        call(post(patientPath()),Map.of("userId",user),428);
        call(post(patientPath()).header("If-Match","\"6\""),Map.of("userId",user),409);
        call(post(patientPath()).header("If-Match",result.getResponse().getHeader("ETag")),Map.of("userId",user),state.equals("REJECTED")?409:200);
    }
    @ParameterizedTest @ValueSource(strings={"bound","legacy"})
    void staleEqualVersionLinkIdentityNeverRevokesReplacement(String route) throws Exception {
        UUID x=active("x@example.org"),y=active("y@example.org");
        JsonNode first=body(call(post(patientPath()),Map.of("userId",x),201)); UUID id=UUID.fromString(first.path("id").asText());
        call(delete("/api/v1/patients/"+patient+"/account-links/"+id).header("If-Match","\"0\""),null,200);
        JsonNode second=body(call(post(patientPath()),Map.of("userId",y),201));
        assertThat(second.path("version").asLong()).isEqualTo(first.path("version").asLong());
        var stale=route.equals("bound")?delete("/api/v1/patients/"+patient+"/account-links/"+id):delete(patientPath()).header("X-Expected-Link-Id",id);
        call(stale.header("If-Match","\"0\""),null,409);
        assertThat(jdbc.queryForObject("select verification_status from patient_user_links where id=?",String.class,UUID.fromString(second.path("id").asText()))).isEqualTo("VERIFIED");
        assertThat(roles(y)).contains("PATIENT");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='PATIENT_LINK_REVOKED'",Integer.class)).isEqualTo(1);
    }
    @Test void legacyRevokeRequiresStrictIdentityAndNumericPrecondition() throws Exception {
        UUID user=active("target@example.org"); JsonNode link=body(call(post(patientPath()),Map.of("userId",user),201));
        call(delete(patientPath()).header("If-Match","\"0\""),null,428);
        for(String invalid:List.of("bad","1-1-1-1-1",UUID.randomUUID()+", "+UUID.randomUUID()))
            call(delete(patientPath()).header("X-Expected-Link-Id",invalid).header("If-Match","\"0\""),null,400);
        call(delete(patientPath()).header("X-Expected-Link-Id",link.path("id").asText()),null,428);
        call(delete(patientPath()).header("X-Expected-Link-Id",link.path("id").asText()).header("If-Match","W/\"0\""),null,400);
        Cookie before=session("target@example.org");
        call(delete(patientPath()).header("X-Expected-Link-Id",link.path("id").asText()).header("If-Match","\"0\""),null,200);
        mvc.perform(get("/api/v1/me").cookie(before)).andExpect(status().isOk()).andExpect(jsonPath("$.patientLink").isEmpty());
        assertThat(roles(user)).doesNotContain("PATIENT");
    }
    @Test void normalizedResolverReturnsOnlyMatchedMaskedChannel() throws Exception {
        UUID user=active("target@example.org"); jdbc.update("update users set phone='+6281234567890',phone_verified_at=now() where id=?",user);
        JsonNode email=body(call(post(resolvePatient()),Map.of("identity"," TARGET@EXAMPLE.ORG "),200));
        assertThat(email.size()).isEqualTo(2); assertThat(email.path("userId").asText()).isEqualTo(user.toString());
        assertThat(email.path("matchedLogin").path("kind").asText()).isEqualTo("EMAIL");
        assertThat(email.path("matchedLogin").path("maskedValue").asText()).isEqualTo("t***@example.org");
        JsonNode phone=body(call(post(resolveSupporter()),Map.of("identity","0812-3456-7890"),200));
        assertThat(phone.path("matchedLogin").path("kind").asText()).isEqualTo("PHONE");
        assertThat(phone.path("matchedLogin").path("maskedValue").asText()).isEqualTo("***7890");
        assertThat(phone.toString()).doesNotContain("email","roles","status","+6281234567890");
    }
    @ParameterizedTest @ValueSource(strings={"missing","inactive","unverified","owned","otherChannel"})
    void unavailableResolutionIsNeutralAndAuditedDurably(String kind) throws Exception {
        UUID user=active("target@example.org"); String identity="target@example.org";
        switch(kind) {
            case "missing" -> identity="unknown@example.org";
            case "inactive" -> jdbc.update("update users set status='DISABLED' where id=?",user);
            case "unverified" -> jdbc.update("update users set email_verified_at=null where id=?",user);
            case "owned" -> call(post(patientPath()),Map.of("userId",user),201);
            case "otherChannel" -> {jdbc.update("update users set phone='+6281234567890' where id=?",user);identity="081234567890";}
        }
        MvcResult result=call(post(resolvePatient()),Map.of("identity",identity),404);
        assertThat(body(result).path("code").asText()).isEqualTo("RESOURCE_NOT_FOUND");
        assertThat(body(result).path("detail").asText()).isEqualTo("Data yang diminta tidak tersedia.");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='ACCOUNT_RESOLUTION_UNAVAILABLE' and actor_user_id=? and entity_id=?",Integer.class,actor,patient)).isEqualTo(1);
        assertThat(jdbc.queryForList("select metadata::text from audit_logs",String.class).toString()).doesNotContain(identity,"target@example.org","081234567890");
    }
    @Test void contextAndActorBudgetsCountSuccessFailureAndSurvive429() throws Exception {
        active("target@example.org");
        for(int i=0;i<5;i++)call(post(resolvePatient()),Map.of("identity",i%2==0?"target@example.org":"unknown@example.org"),i%2==0?200:404);
        call(post(resolvePatient()),Map.of("identity","target@example.org"),429);
        for(int i=0;i<4;i++)call(post(resolveSupporter()),Map.of("identity","unknown@example.org"),404);
        call(post(resolveSupporter()),Map.of("identity","unknown@example.org"),429);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='ACCOUNT_RESOLUTION_THROTTLED'",Integer.class)).isEqualTo(2);
        jdbc.update("update audit_logs set occurred_at=now()-interval '16 minutes' where action like 'ACCOUNT_RESOLUTION_%'");
        call(post(resolvePatient()),Map.of("identity","target@example.org"),200);
    }
    @Test void concurrentRequestsCannotOverspendContextBudget() throws Exception {
        CountDownLatch start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(8)) {
            List<Future<Integer>> jobs=new ArrayList<>();
            for(int i=0;i<8;i++)jobs.add(pool.submit(()->{start.await(); return mvc.perform(post(resolvePatient()).cookie(officer).with(csrf()).contentType("application/json").content("{\"identity\":\"unknown@example.org\"}")).andReturn().getResponse().getStatus();}));
            start.countDown(); List<Integer> statuses=new ArrayList<>();for(var job:jobs)statuses.add(job.get(30,TimeUnit.SECONDS));
            assertThat(statuses.stream().filter(s->s==404).count()).isEqualTo(5); assertThat(statuses.stream().filter(s->s==429).count()).isEqualTo(3);
        }
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action like 'ACCOUNT_RESOLUTION_%'",Integer.class)).isEqualTo(8);
    }
    @Test void supporterCreationAndDetailAreMinimalAuthoritativeAndDoNotCreateRoles() throws Exception {
        MvcResult result=call(post(roster()),Map.of("supporterType","COMPANION","fullName","  Person  ","phone","081234567891"),201);
        JsonNode created=body(result); String id=created.path("id").asText();
        assertThat(result.getResponse().getHeader("ETag")).isEqualTo("\"0\"");
        assertThat(created.path("fullName").asText()).isEqualTo("Person");assertThat(created.path("active").asBoolean()).isTrue();assertThat(created.path("linkedUser").isNull()).isTrue();
        assertThat(created.path("maskedPhone").asText()).isEqualTo("***7891");
        assertThat(jdbc.queryForObject("select linked_user_id from patient_supporters where id=?",UUID.class,UUID.fromString(id))).isNull();
        MvcResult detail=read(roster()+"/"+supporter,200); assertThat(detail.getResponse().getHeader("ETag")).isEqualTo("\"0\"");
        assertThat(detail.getResponse().getContentAsString()).doesNotContain("address","notes","081234567890");
        JsonNode list=body(read(roster()+"?page=0&size=1",200)); assertThat(list.path("content")).hasSize(1);assertThat(list.path("totalElements").asLong()).isEqualTo(2);
        assertThat(list.toString()).doesNotContain("version","linkedUser","address","notes");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='SUPPORTER_CREATED'",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from user_roles",Integer.class)).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"caseId","id","linkedUserId","active","version","address","notes","organizationName","supporterStatus","unexpected"})
    void supporterCreationRejectsEveryUnapprovedProperty(String field) throws Exception {
        Map<String,Object> input=new HashMap<>(Map.of("supporterType","PMO","fullName","Person"));input.put(field,"unapproved");
        call(post(roster()),input,400);assertThat(jdbc.queryForObject("select count(*) from patient_supporters",Integer.class)).isEqualTo(1);
    }
    @ParameterizedTest @ValueSource(strings={"TRANSFERRED","COMPLETED","CLOSED","CANCELLED"})
    void terminalCaseAllowsReadAndUnlinkButNoProspectiveOnboarding(String state) throws Exception {
        UUID user=active("target@example.org"); call(post(supporterLink()).header("If-Match","\"0\""),Map.of("userId",user),200);
        jdbc.update("update tb_cases set status=? where id=?",state,tbCase);
        read(roster(),200);read(roster()+"/"+supporter,200);
        call(post(roster()),Map.of("supporterType","PMO","fullName","Person"),409);
        call(post(resolveSupporter()),Map.of("identity","target@example.org"),409);
        call(post(supporterLink()).header("If-Match","\"1\""),Map.of("userId",user),409);
        call(delete(supporterLink()).header("If-Match","\"1\""),null,200);assertThat(roles(user)).isEmpty();
    }
    @ParameterizedTest @ValueSource(strings={"role","permission","assignment","facility","foreign"})
    void allNewRoutesAuthorizeBeforeMatching(String denial) throws Exception {
        switch(denial) {
            case "role" -> {jdbc.update("delete from user_roles where user_id=?",actor);assign(actor,"SYSTEM_ADMIN");jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='SYSTEM_ADMIN' and p.code in ('PATIENT_LINK_VERIFY','SUPPORTER_LINK_MANAGE') on conflict do nothing");}
            case "permission" -> jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id in (select id from permissions where code in ('PATIENT_LINK_VERIFY','SUPPORTER_LINK_MANAGE'))");
            case "assignment" -> jdbc.update("update user_facilities set active=false where user_id=?",actor);
            case "facility" -> jdbc.update("update facilities set active=false where id=?",facility);
            case "foreign" -> {UUID other=jdbc.queryForObject("insert into facilities(name) values ('Other') returning id",UUID.class);jdbc.update("update tb_registrations set facility_id=? where patient_id=?",other,patient);jdbc.update("update tb_cases set current_facility_id=? where id=?",other,tbCase);}
        }
        try {
            read(patientPath(),403);read(patientPath()+"/precondition?userId="+UUID.randomUUID(),403);read(roster(),403);read(roster()+"/"+supporter,403);
            call(post(resolvePatient()),Map.of("identity","unknown@example.org"),403);call(post(resolveSupporter()),Map.of("identity","unknown@example.org"),403);call(post(roster()),Map.of("supporterType","PMO","fullName","Person"),403);
            assertThat(jdbc.queryForObject("select count(*) from audit_logs where action like 'ACCOUNT_RESOLUTION_%'",Integer.class)).isZero();
        } finally {
            jdbc.update("delete from role_permissions where role_id=(select id from roles where code='SYSTEM_ADMIN') and permission_id in (select id from permissions where code in ('PATIENT_LINK_VERIFY','SUPPORTER_LINK_MANAGE'))");
            jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='TB_OFFICER' and p.code in ('PATIENT_LINK_VERIFY','SUPPORTER_LINK_MANAGE') on conflict do nothing");
        }
    }
    @Test void independentServiceInstancesShareActorBudgetAcrossContexts() throws Exception {
        var first=beans.createBean(id.tbcall.application.identity.AccountResolutionTransaction.class);
        var second=beans.createBean(id.tbcall.application.identity.AccountResolutionTransaction.class);
        assertThat(first).isNotSameAs(second);
        assertThat(org.springframework.aop.support.AopUtils.isAopProxy(first)).isTrue();
        assertThat(org.springframework.aop.support.AopUtils.isAopProxy(second)).isTrue();
        var current=sessions.resolve(officer.getValue()).orElseThrow();
        List<UUID> contexts=List.of(patient,patient(),patient());
        CountDownLatch start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(6)) {
            List<Future<Integer>> jobs=new ArrayList<>();
            for(int i=0;i<15;i++) {
                int index=i; jobs.add(pool.submit(()->{
                    start.await();var result=(index%2==0?first:second).resolve(current,contexts.get(index%3),null,null,null);
                    return result.failure().status();
                }));
            }
            start.countDown();List<Integer> statuses=new ArrayList<>();for(var job:jobs)statuses.add(job.get(30,TimeUnit.SECONDS));
            assertThat(statuses.stream().filter(s->s==400).count()).isEqualTo(10);
            assertThat(statuses.stream().filter(s->s==429).count()).isEqualTo(5);
        }
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='ACCOUNT_RESOLUTION_INVALID'",Integer.class)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='ACCOUNT_RESOLUTION_THROTTLED'",Integer.class)).isEqualTo(5);
    }
    @ParameterizedTest @ValueSource(strings={"create","link","unlink","resolve"})
    void concurrentTransferIsRecheckedAfterCaseLock(String operation) throws Exception {
        UUID target=active("target@example.org");
        if(operation.equals("unlink"))call(post(supporterLink()).header("If-Match","\"0\""),Map.of("userId",target),200);
        UUID other=jdbc.queryForObject("insert into facilities(name) values ('Destination') returning id",UUID.class);
        try(var connection=Objects.requireNonNull(jdbc.getDataSource()).getConnection();var pool=Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try(var lock=connection.prepareStatement("select id from tb_cases where id=? for update")) {lock.setObject(1,tbCase);lock.executeQuery().close();}
            var response=pool.submit(()->{
                var request=switch(operation) {
                    case "create" -> post(roster()).content(json.writeValueAsString(Map.of("supporterType","PMO","fullName","Person")));
                    case "link" -> post(supporterLink()).header("If-Match","\"0\"").content(json.writeValueAsString(Map.of("userId",target)));
                    case "resolve" -> post(resolveSupporter()).content("{\"identity\":\"target@example.org\"}");
                    default -> delete(supporterLink()).header("If-Match","\"1\"");
                };
                return mvc.perform(request.cookie(officer).with(csrf()).contentType("application/json")).andReturn().getResponse().getStatus();
            });
            try {
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
                while(System.nanoTime()<deadline && jdbc.queryForObject("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%tb_cases%'",Integer.class)==0)Thread.sleep(20);
                assertThat(jdbc.queryForObject("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%tb_cases%'",Integer.class)).isPositive();
                try(var update=connection.prepareStatement("update tb_cases set current_facility_id=?,version=version+1 where id=?")) {update.setObject(1,other);update.setObject(2,tbCase);update.executeUpdate();}
                connection.commit();assertThat(response.get(15,TimeUnit.SECONDS)).isEqualTo(403);
            } finally {connection.rollback();}
        }
        assertThat(jdbc.queryForObject("select count(*) from patient_supporters",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select linked_user_id from patient_supporters where id=?",UUID.class,supporter)).isEqualTo(operation.equals("unlink")?target:null);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='SUPPORTER_CREATED' or action='SUPPORTER_UNLINKED' or action like 'ACCOUNT_RESOLUTION_%'",Integer.class)).isZero();
    }
    @Test void apiCreatedSupporterCanBeResolvedLinkedReadAndUnlinkedWithoutRelogin() throws Exception {
        UUID user=active("target@example.org");Cookie before=session("target@example.org");
        jdbc.update("insert into treatments(case_id,facility_id,start_date,status) values (?,?,current_date,'ACTIVE')",tbCase,facility);
        mvc.perform(get("/api/v1/me/supporting-cases/"+tbCase+"/treatment").cookie(before)).andExpect(status().isForbidden());
        JsonNode created=body(call(post(roster()),Map.of("supporterType","PMO","fullName","Person"),201));
        String route=roster()+"/"+created.path("id").asText();
        JsonNode candidate=body(call(post(route+"/account-link/resolve-user"),Map.of("identity","target@example.org"),200));
        assertThat(candidate.path("userId").asText()).isEqualTo(user.toString());
        MvcResult detail=read(route,200);
        call(post(route+"/account-link").header("If-Match",detail.getResponse().getHeader("ETag")),Map.of("userId",user),200);
        mvc.perform(get("/api/v1/me").cookie(before)).andExpect(status().isOk()).andExpect(jsonPath("$.supporterCaseIds[0]").value(tbCase.toString()));
        mvc.perform(get("/api/v1/me/supporting-cases/"+tbCase+"/treatment").cookie(before)).andExpect(status().isOk());
        MvcResult linked=read(route,200);assertThat(body(linked).path("linkedUser").path("maskedEmail").asText()).isEqualTo("t***@example.org");
        call(delete(route+"/account-link").header("If-Match",linked.getResponse().getHeader("ETag")),null,200);
        mvc.perform(get("/api/v1/me").cookie(before)).andExpect(status().isOk()).andExpect(jsonPath("$.supporterCaseIds").isEmpty());
        mvc.perform(get("/api/v1/me/supporting-cases/"+tbCase+"/treatment").cookie(before)).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from user_sessions where user_id=? and revoked_at is null",Integer.class,user)).isEqualTo(1);
    }
    @Test void patientSessionSeesLinkAndRevokeWithoutRelogin() throws Exception {
        UUID user=active("target@example.org");Cookie before=session("target@example.org");
        mvc.perform(get("/api/v1/me/patient").cookie(before)).andExpect(status().isForbidden());
        call(post(patientPath()),Map.of("userId",user),201);
        mvc.perform(get("/api/v1/me/patient").cookie(before)).andExpect(status().isOk());
        JsonNode link=body(read(patientPath(),200)).path("link");
        call(delete("/api/v1/patients/"+patient+"/account-links/"+link.path("id").asText()).header("If-Match","\"0\""),null,200);
        mvc.perform(get("/api/v1/me/patient").cookie(before)).andExpect(status().isForbidden());
    }
    @Test void missingAndForeignSupportersAreIndistinguishableBeforeMatching() throws Exception {
        UUID foreignPatient=patient();
        UUID foreignCase=jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id) select id,? from tb_registrations where patient_id=? returning id",UUID.class,facility,foreignPatient);
        UUID foreign=jdbc.queryForObject("insert into patient_supporters(case_id,supporter_type,full_name) values (?,'PMO','Other') returning id",UUID.class,foreignCase);
        for(UUID id:List.of(UUID.randomUUID(),foreign)) {
            read(roster()+"/"+id,404);
            call(post(roster()+"/"+id+"/account-link/resolve-user"),Map.of("identity","unknown@example.org"),404);
        }
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action like 'ACCOUNT_RESOLUTION_%'",Integer.class)).isZero();
    }
    @Test void inactiveSupporterCanBeReadButCannotBeResolvedOrLinked() throws Exception {
        UUID user=active("target@example.org");jdbc.update("update patient_supporters set active=false where id=?",supporter);
        read(roster(),200);read(roster()+"/"+supporter,200);
        call(post(resolveSupporter()),Map.of("identity","target@example.org"),409);
        call(post(supporterLink()),Map.of("userId",user),428);
        call(post(supporterLink()).header("If-Match","W/\"0\""),Map.of("userId",user),400);
        call(delete(supporterLink()),null,428);
        call(post(supporterLink()).header("If-Match","\"0\""),Map.of("userId",user),409);
    }
    @Test void readOnlyGetsDoNotGenerateAuditAndPairReadsStayInSpecifiedPatient() throws Exception {
        UUID user=active("target@example.org"),other=patient();
        jdbc.update("insert into patient_user_links(patient_id,user_id,verification_status) values (?,?,'PENDING')",other,user);
        int count=jdbc.queryForObject("select count(*) from audit_logs",Integer.class);
        read(patientPath(),200);read(roster(),200);read(roster()+"/"+supporter,200);
        assertThat(body(read(patientPath()+"/precondition?userId="+user,200)).path("pair").isNull()).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs",Integer.class)).isEqualTo(count);
    }
    @ParameterizedTest @ValueSource(strings={"?page=-1","?size=0","?size=51","?page=2147483647&size=50"})
    void rosterRejectsInvalidPagination(String query)throws Exception {read(roster()+query,400);}
    @ParameterizedTest @ValueSource(strings={"badType","blankName","longName","longPhone"})
    void supporterCreationValidatesMinimalFields(String kind)throws Exception {
        var input=new HashMap<String,Object>(Map.of("supporterType","PMO","fullName","Person"));
        switch(kind){case "badType"->input.put("supporterType","OTHER");case "blankName"->input.put("fullName","  ");case "longName"->input.put("fullName","x".repeat(256));case "longPhone"->input.put("phone","1".repeat(31));}
        call(post(roster()),input,400);
    }
    @Test void identicalNamesAndTypesDoNotCreateUnsupportedSingletonRule()throws Exception {
        for(int i=0;i<2;i++)call(post(roster()),Map.of("supporterType","PMO","fullName","Person"),201);
        assertThat(jdbc.queryForObject("select count(*) from patient_supporters where full_name='Person'",Integer.class)).isEqualTo(2);
    }
    @Test void explicitlyExternallyAuthoritativeCaseBlocksNewDomainWriteButNotIdentityMetadata()throws Exception {
        jdbc.update("insert into external_source_authorities(external_system_id,entity_type,entity_id,authority_scope) select id,'TB_CASE',?,'CLINICAL' from external_systems where code='SITB'",tbCase);
        MvcResult result=call(post(roster()),Map.of("supporterType","PMO","fullName","Person"),409);
        assertThat(body(result).path("code").asText()).isEqualTo("SOURCE_AUTHORITY_CONFLICT");
        UUID user=active("target@example.org");call(post(supporterLink()).header("If-Match","\"0\""),Map.of("userId",user),200);
        call(delete(supporterLink()).header("If-Match","\"1\""),null,200);
    }
    @Test void throttleQueryUsesActorAndTimeIndexRangeDespiteLongAuditHistory()throws Exception {
        jdbc.update("insert into audit_logs(actor_user_id,action,entity_type,occurred_at) select ?,'ACCOUNT_RESOLUTION_UNAVAILABLE','PATIENT',now()-interval '1 day' from generate_series(1,25000)",actor);
        jdbc.execute("analyze audit_logs");
        call(post(resolvePatient()),Map.of("identity","unknown@example.org"),404);
        String emitted=LookupSqlInspector.actorCount.get();assertThat(emitted).isNotBlank();
        // EXPLAIN the query emitted by the actual limiter, not a test-owned imitation of it.
        Object[] bindings=emitted.contains("clock_timestamp()")?new Object[]{actor}:new Object[]{actor,java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(15)};
        String plan=String.join("\n",jdbc.queryForList("explain (analyze,buffers) "+emitted,String.class,bindings));
        assertThat(plan).contains("idx_audit_logs_actor");
        assertThat(Arrays.stream(plan.split("\n")).filter(line->line.contains("Index Cond:")).collect(java.util.stream.Collectors.joining())).contains("occurred_at");
    }
    @Test void linkPermissionsDoNotRequireUnrelatedClinicalReadGrants()throws Exception {
        jdbc.update("delete from role_permissions where role_id=(select id from roles where code='TB_OFFICER') and permission_id in (select id from permissions where code in ('PATIENT_READ','CASE_READ'))");
        try {read(patientPath(),200);read(roster(),200);call(post(resolvePatient()),Map.of("identity","unknown@example.org"),404);}
        finally {jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code='TB_OFFICER' and p.code in ('PATIENT_READ','CASE_READ') on conflict do nothing");}
    }
    @Test void historicalPatientLinkScopeAndReferredCaseOnboardingRemainSupported()throws Exception {
        UUID user=active("target@example.org");
        jdbc.update("update tb_registrations set status='CLOSED' where patient_id=?",patient);jdbc.update("update tb_cases set status='CLOSED' where id=?",tbCase);
        read(patientPath(),200);call(post(resolvePatient()),Map.of("identity","target@example.org"),200);
        call(post(patientPath()),Map.of("userId",user),201);
        jdbc.update("update tb_cases set status='REFERRED' where id=?",tbCase);
        call(post(roster()),Map.of("supporterType","COMPANION","fullName","Person"),201);
        // Existing PATIENT ownership does not disqualify a supporter candidate.
        call(post(resolveSupporter()),Map.of("identity","target@example.org"),200);
        call(post(supporterLink()).header("If-Match","\"0\""),Map.of("userId",user),200);
        assertThat(roles(user)).containsExactlyInAnyOrder("PATIENT","TREATMENT_SUPPORTER");
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","FACILITY_ADMIN","LAB_STAFF","PATIENT","TREATMENT_SUPPORTER"})
    void artificialPermissionGrantsNeverBypassOfficerRole(String role)throws Exception {
        UUID user=active("wrongrole@example.org");assign(user,role);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",user,facility);
        jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.code=? and p.code in ('PATIENT_LINK_VERIFY','SUPPORTER_LINK_MANAGE') on conflict do nothing",role);
        Cookie before=officer;officer=session("wrongrole@example.org");
        try {
            read(patientPath(),403);read(patientPath()+"/precondition?userId="+actor,403);read(roster(),403);read(roster()+"/"+supporter,403);
            call(post(resolvePatient()),Map.of("identity","officer@example.org"),403);call(post(resolveSupporter()),Map.of("identity","officer@example.org"),403);
            call(post(roster()),Map.of("supporterType","PMO","fullName","Person"),403);
            assertThat(jdbc.queryForObject("select count(*) from audit_logs where action like 'ACCOUNT_RESOLUTION_%'",Integer.class)).isZero();
        } finally {
            officer=before;jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id in (select id from permissions where code in ('PATIENT_LINK_VERIFY','SUPPORTER_LINK_MANAGE'))",role);
        }
    }
    @Test void supporterDetailProvidesOnlyItsOwnRowPreconditionForAllExistingWrites()throws Exception {
        UUID one=active("one@example.org"),two=active("two@example.org");
        for(String invalid:List.of("*","W/\"0\"","\"0\",\"1\"","garbage"))call(post(supporterLink()).header("If-Match",invalid),Map.of("userId",one),400);
        call(post(supporterLink()),Map.of("userId",one),428);
        MvcResult initial=read(roster()+"/"+supporter,200);
        call(post(supporterLink()).header("If-Match",initial.getResponse().getHeader("ETag")),Map.of("userId",one),200);
        call(post(supporterLink()).header("If-Match",initial.getResponse().getHeader("ETag")),Map.of("userId",two),409);
        call(delete(supporterLink()).header("If-Match",initial.getResponse().getHeader("ETag")),null,409);
        call(delete(supporterLink()),null,428);
        MvcResult linked=read(roster()+"/"+supporter,200);
        call(post(supporterLink()).header("If-Match",linked.getResponse().getHeader("ETag")),Map.of("userId",two),200);
        assertThat(roles(one)).isEmpty();assertThat(roles(two)).contains("TREATMENT_SUPPORTER");
        call(delete(supporterLink()).header("If-Match",read(roster()+"/"+supporter,200).getResponse().getHeader("ETag")),null,200);
        assertThat(roles(two)).isEmpty();
    }
    @Test void resolverAcceptsBodyOnlyAndRejectsDirectoryShapedInputs()throws Exception {
        call(post(resolvePatient()+"?identity=unknown@example.org"),null,400);
        call(post(resolvePatient()),Map.of("identity","unknown@example.org","name","Person"),400);
        call(post(resolvePatient()),Map.of("identities",List.of("unknown@example.org")),400);
        call(post(resolvePatient()),Map.of("identity","Person Name"),400);
        call(post(resolvePatient()),Map.of("identity","1234567890123456"),400);
        call(post(resolvePatient()),Map.of("identity","partial@example"),400);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='ACCOUNT_RESOLUTION_INVALID'",Integer.class)).isEqualTo(3);
    }
    private String patientPath(){return "/api/v1/patients/"+patient+"/account-link";}
    private String roster(){return "/api/v1/cases/"+tbCase+"/supporters";}
    private String supporterLink(){return roster()+"/"+supporter+"/account-link";}
    private String resolvePatient(){return patientPath()+"/resolve-user";}
    private String resolveSupporter(){return supporterLink()+"/resolve-user";}
    private MvcResult read(String path,int expected) throws Exception {return mvc.perform(get(path).cookie(officer)).andExpect(status().is(expected)).andReturn();}
    private MvcResult call(MockHttpServletRequestBuilder request,Object input,int expected) throws Exception {
        if(input!=null)request.contentType("application/json").content(json.writeValueAsString(input));
        return mvc.perform(request.cookie(officer).with(csrf())).andExpect(status().is(expected)).andReturn();
    }
    private JsonNode body(MvcResult result)throws Exception{return json.readTree(result.getResponse().getContentAsString());}
    private UUID active(String email)throws Exception {
        JsonNode registered=body(mvc.perform(post("/api/v1/auth/register").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("email",email,"password",PASSWORD)))).andExpect(status().isCreated()).andReturn());
        mvc.perform(post("/api/v1/auth/verify").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("token",registered.path("verificationTokens").get(0).path("token").asText())))).andExpect(status().isOk());
        return UUID.fromString(registered.path("id").asText());
    }
    private Cookie session(String email)throws Exception{return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD)))).andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");}
    private void assign(UUID user,String role){jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",user,role);}
    private List<String> roles(UUID user){return jdbc.queryForList("select r.code from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=?",String.class,user);}
    private UUID patient(){UUID id=jdbc.queryForObject("insert into patients(full_name) values ('Test patient') returning id",UUID.class);jdbc.update("insert into tb_registrations(patient_id,facility_id,registration_date) values (?,?,current_date)",id,facility);return id;}
}
