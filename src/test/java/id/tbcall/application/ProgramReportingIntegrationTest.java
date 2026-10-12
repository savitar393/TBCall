package id.tbcall.application;

import id.tbcall.security.PasswordHasher;
import jakarta.servlet.http.Cookie;
import java.util.*;
import java.util.concurrent.*;
import java.time.OffsetDateTime;
import id.tbcall.application.reporting.ReportingCatalogue;
import id.tbcall.application.reporting.ReportingPublicationService;
import id.tbcall.application.reporting.ProgramReportService;
import id.tbcall.application.reporting.ReportingAccess;
import id.tbcall.application.reporting.ReportingStore;
import id.tbcall.application.common.AuditService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import id.tbcall.authorization.CurrentActor;
import javax.sql.DataSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import static org.mockito.Mockito.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.JsonNode;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"tbcall.security.production=false","tbcall.monitoring.scheduler-enabled=false"})
@ActiveProfiles("test") @AutoConfigureMockMvc @Testcontainers
class ProgramReportingIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:16-alpine")
            .withImagePullPolicy(image -> false).withTmpFs(Map.of("/var/lib/postgresql/data","rw"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username",POSTGRES::getUsername);
        r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired PasswordHasher passwords;
    @Autowired DataSource dataSource; @Autowired PlatformTransactionManager transactions;
    @Autowired ReportingAccess access; @Autowired ReportingStore store; @Autowired AuditService audit;
    @Autowired ReportingPublicationService publications; @Autowired ProgramReportService reports;
    @MockitoSpyBean ReportingCatalogue catalogue;
    final JsonMapper json=JsonMapper.builder().build();
    static final String PASSWORD="Synthetic reporting test password 2026!";
    static String hash;
    Cookie admin; UUID administrator;
    @BeforeEach void setup() throws Exception {
        if(hash==null) hash=passwords.encode(PASSWORD);
        jdbc.execute("truncate users,patients,facilities restart identity cascade");
        jdbc.update("update reporting_publication_guard set sequence=0 where id=1");
        administrator=user("administrator@example.invalid","SYSTEM_ADMIN"); admin=login("administrator@example.invalid");
    }
    @ParameterizedTest @ValueSource(strings={"SYSTEM_ADMIN","TB_OFFICER","LAB_STAFF","FACILITY_ADMIN","PATIENT","TREATMENT_SUPPORTER"})
    void legacyPermissionsAndRolesDoNotGrantReporting(String role) throws Exception {
        user("fictional@example.invalid",role);
        Cookie cookie=login("fictional@example.invalid");
        for(String endpoint:List.of("summary","breakdown","metadata"))
            mvc.perform(get("/api/v1/program-reports/"+endpoint).cookie(cookie)).andExpect(status().isForbidden());
    }
    @Test void catalogueHasExactDottedCodesAndVerifiedParentRelationships() {
        assertThat(jdbc.queryForObject("select count(*) from reporting_regions where level='PROVINCE'",Integer.class)).isEqualTo(38);
        assertThat(jdbc.queryForObject("select count(*) from reporting_regions where level='REGENCY'",Integer.class)).isEqualTo(514);
        assertThat(jdbc.queryForObject("select parent_code from reporting_regions where code='31.71'",String.class)).isEqualTo("31");
        assertThat(jdbc.queryForObject("select parent_code from reporting_regions where code='33.01'",String.class)).isEqualTo("33");
        assertThat(jdbc.queryForObject("select entries_checksum from reporting_catalogues",String.class)).isEqualTo(ReportingCatalogue.CHECKSUM);
        assertThat(jdbc.queryForObject("select count(*) from reporting_regions where code='3171'",Integer.class)).isZero();
    }
    @Test void anUnassignedMonitorCannotReadAndDenialAuditSurvivesRollback() throws Exception {
        user("monitor@example.invalid","PROGRAM_MONITOR"); Cookie monitor=login("monitor@example.invalid");
        for(String endpoint:List.of("summary","breakdown","metadata")) read(monitor,endpoint,"",403);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REPORT_ACCESS_DENIED'",Integer.class)).isEqualTo(3);
    }
    @Test void unpublishedIsUnavailableAndEmptyPublishedSnapshotIsAnObservedZero() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid");
        assertThat(read(cookie,"summary","",503).path("code").asText()).isEqualTo("REPORT_NOT_PUBLISHED");
        publish(capture(),200);
        assertThat(read(cookie,"summary","",200).path("summary").path("indicators").path("caseEpisodes").asLong()).isZero();
        assertThat(read(cookie,"metadata","",200).path("unattributedCaseEpisodes").asLong()).isZero();
    }
    @Test void aggregationDistinguishesEpisodesOutcomesFacilitiesAndPrivatePatientSupport() throws Exception {
        UUID a=facility("31","31.71"),b=facility("31","31.72"),c=facility("33","33.01");
        cohort(a,10,true); cohort(b,10,true); cohort(c,10,true);
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid");
        UUID snapshot=capture(); publish(snapshot,200);
        JsonNode summary=read(cookie,"summary","",200),i=summary.path("summary").path("indicators");
        assertThat(i.path("caseEpisodes").asLong()).isEqualTo(60);
        assertThat(i.path("activeCaseEpisodes").asLong()).isEqualTo(30);
        assertThat(i.path("completedCaseEpisodes").asLong()).isEqualTo(30);
        assertThat(i.path("activeTreatmentEpisodes").asLong()).isEqualTo(30);
        assertThat(i.path("recordedTreatmentOutcomes").asLong()).isEqualTo(30);
        assertThat(i.path("representedFacilities").asLong()).isEqualTo(3);
        assertThat(read(cookie,"summary","?scope=PROVINCE&regionCode=31",200).path("summary").path("indicators").path("caseEpisodes").asLong()).isEqualTo(40);
        assertThat(read(cookie,"summary","?scope=REGENCY&regionCode=31.71",200).path("summary").path("indicators").path("caseEpisodes").asLong()).isEqualTo(20);
        JsonNode national=read(cookie,"breakdown","",200); assertThat(national.path("rows").size()).isEqualTo(38);
        long summed=0; for(JsonNode row:national.path("rows")) summed+=row.path("indicators").path("caseEpisodes").asLong();
        assertThat(summed).isEqualTo(60);
        assertThat(read(cookie,"breakdown","?scope=PROVINCE&regionCode=31",200).path("rows").size()).isEqualTo(6);
        assertThat(read(cookie,"breakdown","?scope=REGENCY&regionCode=31.71",200).path("state").asText()).isEqualTo("LEAF_SCOPE");
        JsonNode metadata=read(cookie,"metadata","",200);
        assertThat(metadata.path("dataSource").asText()).isEqualTo("TBCALL_HELD_RECORDS_NOT_OFFICIAL_SURVEILLANCE");
        assertThat(metadata.path("sources").size()).isEqualTo(3);
        assertThat(metadata.path("minimumPatientSupport").asInt()).isEqualTo(10);
        assertThat(metadata.path("indicators").size()).isEqualTo(6);
        String all=summary+national.toString()+metadata;
        assertThat(all).doesNotContain("Fictional private patient","PRIVATE-NIK","PRIVATE-BPJS","PRIVATE-PHONE","PRIVATE-NOTE","patientId","patient_id","privateContributions");
        for(UUID patient:jdbc.queryForList("select id from patients",UUID.class)) assertThat(all).doesNotContain(patient.toString());
    }
    @Test void scopeQueriesRejectOtherProvincesAndRegenciesWithoutFacilityInheritance() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR");
        UUID other=facility("33","33.01"); cohort(other,10,false);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='TB_OFFICER'",monitor);
        jdbc.update("insert into user_facilities(user_id,facility_id) values (?,?)",monitor,other);
        grant(monitor,"PROVINCE","31"); Cookie cookie=login("monitor@example.invalid"); publish(capture(),200);
        read(cookie,"summary","?scope=PROVINCE&regionCode=33",403);
        read(cookie,"summary","?scope=REGENCY&regionCode=33.01",403);
        read(cookie,"summary","?scope=NATIONAL",403);
        assertThat(read(cookie,"summary","",200).path("summary").path("indicators").path("caseEpisodes").asLong()).isZero();
        UUID district=user("district@example.invalid","PROGRAM_MONITOR"); grant(district,"REGENCY","31.71"); Cookie d=login("district@example.invalid");
        read(d,"summary","?scope=REGENCY&regionCode=31.72",403); read(d,"summary","?scope=PROVINCE&regionCode=31",403);
        assertThat(read(d,"metadata","",200).path("unattributedCaseEpisodes").isNull()).isTrue();
    }
    @Test void explicitMultipleGrantsNeverBecomeAnImplicitUnionOrNationalScope() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"PROVINCE","31"); grant(monitor,"PROVINCE","33");
        Cookie cookie=login("monitor@example.invalid"); publish(capture(),200);
        read(cookie,"summary","",400); read(cookie,"summary","?scope=NATIONAL",403);
        read(cookie,"summary","?scope=PROVINCE&regionCode=31",200); read(cookie,"summary","?scope=PROVINCE&regionCode=33",200);
    }
    @Test void completedCaseIsNotAnInferredOutcomeAndPausedOrPlannedTreatmentIsNotActive() throws Exception {
        UUID f=facility("31","31.71");
        for(int n=0;n<10;n++) { UUID p=patient(); UUID c=tbCase(p,f,"COMPLETED"); treatment(c,f,"COMPLETED");
            UUID active=tbCase(p,f,"ACTIVE"); treatment(active,f,"PAUSED"); }
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid");
        publish(capture(),200); JsonNode i=read(cookie,"summary","",200).path("summary").path("indicators");
        assertThat(i.path("completedCaseEpisodes").asLong()).isEqualTo(10);
        assertThat(i.path("activeTreatmentEpisodes").asLong()).isZero();
        assertThat(i.path("recordedTreatmentOutcomes").asLong()).isZero();
    }
    @Test void incompleteAndMismatchedLocationsAreExcludedWithoutRepairOrRegionalQualityLeakage() throws Exception {
        UUID good=facility("31","31.71"),legacy=facility("31","3171"),mismatch=facility("31","33.01"),missing=facility(null,null);
        cohort(good,10,false); cohort(legacy,10,false); cohort(mismatch,10,false); cohort(missing,10,false);
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid"); publish(capture(),200);
        assertThat(read(cookie,"summary","",200).path("summary").path("indicators").path("caseEpisodes").asLong()).isEqualTo(10);
        assertThat(read(cookie,"metadata","",200).path("unattributedCaseEpisodes").asLong()).isEqualTo(30);
        JsonNode province=read(cookie,"metadata","?scope=PROVINCE&regionCode=31",200);
        assertThat(province.path("unattributedCaseEpisodes").isNull()).isTrue();
        assertThat(jdbc.queryForObject("select regency_code from facilities where id=?",String.class,legacy)).isEqualTo("3171");
        assertThat(jdbc.queryForObject("select province_code from facilities where id=?",String.class,mismatch)).isEqualTo("31");
    }
    @Test void rareComplementAndRepeatedEpisodesBlockEveryNumericEndpoint() throws Exception {
        UUID f=facility("31","31.71"); cohort(f,10,false);
        UUID repeated=patient(); for(int n=0;n<25;n++) tbCase(repeated,f,"REFERRED");
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid");
        UUID candidate=capture(); publish(candidate,409);
        for(String endpoint:List.of("summary","breakdown","metadata")) read(cookie,endpoint,"",503);
        assertThat(jdbc.queryForObject("select state from reporting_snapshots where id=?",String.class,candidate)).isEqualTo("DRAFT");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REPORT_PUBLICATION_WITHHELD'",Integer.class)).isEqualTo(1);
        JsonNode adminView=node(mvc.perform(get("/api/v1/admin/reporting-snapshots/"+candidate).cookie(admin)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(adminView.properties().stream().map(Map.Entry::getKey).toList()).containsExactlyInAnyOrder("id","version","state","dataAsOf","catalogueVersion");
    }
    @Test void catalogueTamperingRefusesGrantReadCaptureAndPublication() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid"); UUID candidate=capture();
        String name=jdbc.queryForObject("select name from reporting_regions where code='31'",String.class);
        jdbc.update("update reporting_regions set name='UNVERIFIED' where code='31'");
        try { read(cookie,"metadata","",503);
            mvc.perform(post("/api/v1/admin/reporting-snapshots").cookie(admin).with(csrf())).andExpect(status().isServiceUnavailable());
            publish(candidate,503);
        } finally { jdbc.update("update reporting_regions set name=? where code='31'",name); }
    }
    @Test void invalidCodesCannotBeGrantedByFormattingPrefixOrNormalization() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR");
        for(var input:List.of(Map.of("scope","REGENCY","regionCode","3171"),Map.of("scope","REGENCY","regionCode","31.99"),Map.of("scope","PROVINCE","regionCode"," 31"),Map.of("scope","NATIONAL","regionCode","31"),Map.of("scope","DISTRICT","regionCode","31.71")))
            mvc.perform(post(grantPath(monitor)).cookie(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(input))).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from reporting_grants",Integer.class)).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"PROGRAM_MONITOR","TB_OFFICER","LAB_STAFF","FACILITY_ADMIN","PATIENT","TREATMENT_SUPPORTER"})
    void managementAndApprovalRequireSystemAdminAndDedicatedPermissions(String role) throws Exception {
        UUID target=user("target@example.invalid","PROGRAM_MONITOR"); user("actor@example.invalid",role); Cookie actor=login("actor@example.invalid");
        mvc.perform(post(grantPath(target)).cookie(actor).with(csrf()).contentType("application/json").content("{\"scope\":\"NATIONAL\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/reporting-snapshots").cookie(actor).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(get(grantPath(target)).cookie(actor)).andExpect(status().isForbidden());
    }
    @Test void scopeRevocationIsIdentityBoundVersionedAuditedAndImmediatelyEffective() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"),other=user("other@example.invalid","PROGRAM_MONITOR");
        UUID grant=grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid"); publish(capture(),200);
        read(cookie,"summary","",200);
        String path=grantPath(monitor)+"/"+grant;
        String tag=mvc.perform(get(path).cookie(admin)).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
        mvc.perform(delete(grantPath(other)+"/"+grant).cookie(admin).with(csrf()).header("If-Match",tag)).andExpect(status().isNotFound());
        mvc.perform(delete(path).cookie(admin).with(csrf())).andExpect(status().is(428));
        mvc.perform(delete(path).cookie(admin).with(csrf()).header("If-Match","\"999\"")).andExpect(status().isConflict());
        mvc.perform(delete(path).cookie(admin).with(csrf()).header("If-Match",tag)).andExpect(status().isOk()).andExpect(header().string("ETag","\"1\""));
        read(cookie,"summary","",403);
        mvc.perform(delete(path).cookie(admin).with(csrf()).header("If-Match",tag)).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REPORT_SCOPE_REVOKED'",Integer.class)).isEqualTo(1);
    }
    @Test void roleAndPermissionRevocationAreEffectiveInAnExistingSession() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid"); publish(capture(),200);
        jdbc.update("delete from user_roles where user_id=?",monitor); read(cookie,"summary","",403);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code='PROGRAM_MONITOR'",monitor);
        permission("PROGRAM_MONITOR","REPORT_READ",false);
        try { read(cookie,"summary","",403); } finally { permission("PROGRAM_MONITOR","REPORT_READ",true); }
        read(cookie,"summary","",200);
    }
    @Test void adminPrivilegesAreIndependentFromReportingReadsAndClinicalPermissions() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); publish(capture(),200);
        read(admin,"summary","",403);
        Cookie cookie=login("monitor@example.invalid");
        mvc.perform(get("/api/v1/operational-dashboard").cookie(cookie)).andExpect(status().isForbidden());
        permission("SYSTEM_ADMIN","REPORT_SCOPE_MANAGE",false);
        try { mvc.perform(get(grantPath(monitor)).cookie(admin)).andExpect(status().isForbidden()); } finally { permission("SYSTEM_ADMIN","REPORT_SCOPE_MANAGE",true); }
        permission("SYSTEM_ADMIN","REPORT_PUBLISH",false);
        try { mvc.perform(post("/api/v1/admin/reporting-snapshots").cookie(admin).with(csrf())).andExpect(status().isForbidden()); } finally { permission("SYSTEM_ADMIN","REPORT_PUBLISH",true); }
    }
    @ParameterizedTest @ValueSource(strings={"?patientId=fictional","?from=2026-01-01","?facilityId=fictional","?groupBy=status","?outcomeCode=SEMBUH","?snapshotId=old","?scope=NATIONAL&scope=PROVINCE","?scope=REGENCY&regionCode=31.71&regionCode=33.01","?scope=DISTRICT","?scope=NATIONAL&regionCode=31"})
    void unknownHistoricalClinicalOrDuplicateFiltersAreRejected(String query) throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid");
        for(String endpoint:List.of("summary","breakdown","metadata")) read(cookie,endpoint,query,400);
    }
    @Test void publicationNeedsExplicitApprovalFreshEtagAndCsrfAndCannotRewriteSnapshot() throws Exception {
        UUID candidate=capture(); String path="/api/v1/admin/reporting-snapshots/"+candidate+"/publish";
        mvc.perform(post(path).cookie(admin).with(csrf()).contentType("application/json").content("{\"approved\":false}").header("If-Match","\"0\"")).andExpect(status().isBadRequest());
        mvc.perform(post(path).cookie(admin).contentType("application/json").content("{\"approved\":true}").header("If-Match","\"0\"")).andExpect(status().isForbidden());
        mvc.perform(post(path).cookie(admin).with(csrf()).contentType("application/json").content("{\"approved\":true}")).andExpect(status().is(428));
        publish(candidate,200); publish(candidate,409);
        assertThatThrownBy(()->jdbc.update("update reporting_snapshots set data_as_of=now() where id=?",candidate)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("delete from reporting_snapshots where id=?",candidate)).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    @Test void laterSinglePatientChangeIsWithheldAndPriorPublishedReadsStayImmutable() throws Exception {
        UUID f=facility("31","31.71"); List<UUID> cases=cohort(f,20,false);
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid");
        UUID first=capture(); publish(first,200); String before=read(cookie,"summary","",200).toString();
        jdbc.update("update tb_cases set status='COMPLETED' where id=?",cases.getFirst()); UUID next=capture(); publish(next,409);
        assertThat(read(cookie,"summary","",200).toString()).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from reporting_snapshots where state='PUBLISHED'",Integer.class)).isEqualTo(1);
    }
    @Test void transferUsesOneCurrentResponsibleFacilityAndIgnoresReferralMultiplicity() throws Exception {
        UUID a=facility("31","31.71"),b=facility("33","33.01"); List<UUID> cases=cohort(a,10,false);
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); grant(monitor,"NATIONAL",null); Cookie cookie=login("monitor@example.invalid"); publish(capture(),200);
        for(UUID c:cases) {
            jdbc.update("insert into referrals(case_id,source_facility_id,destination_facility_id,referral_type,status,sent_at,patient_reported_at) values (?,?,?,'TREATMENT_TRANSFER','REPORTED',now(),now())",c,a,b);
            jdbc.update("insert into referrals(case_id,source_facility_id,destination_facility_id,referral_type,status,sent_at,cancelled_at,cancel_reason) values (?,?,?,'TREATMENT_TRANSFER','CANCELLED',now(),now(),'Synthetic fixture')",c,b,a);
            jdbc.update("update tb_cases set current_facility_id=? where id=?",b,c);
        }
        publish(capture(),200);
        assertThat(read(cookie,"summary","",200).path("summary").path("indicators").path("caseEpisodes").asLong()).isEqualTo(10);
        assertThat(read(cookie,"summary","?scope=PROVINCE&regionCode=31",200).path("summary").path("indicators").path("caseEpisodes").asLong()).isZero();
        assertThat(read(cookie,"summary","?scope=PROVINCE&regionCode=33",200).path("summary").path("indicators").path("caseEpisodes").asLong()).isEqualTo(10);
    }
    @Test void concurrentAssignmentsAndApprovalsNeverDuplicateWrites() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); Cookie second=login("administrator@example.invalid");
        List<Integer> assigned=race(()->mvc.perform(post(grantPath(monitor)).cookie(admin).with(csrf()).contentType("application/json").content("{\"scope\":\"NATIONAL\"}")).andReturn().getResponse().getStatus(),
                ()->mvc.perform(post(grantPath(monitor)).cookie(second).with(csrf()).contentType("application/json").content("{\"scope\":\"NATIONAL\"}")).andReturn().getResponse().getStatus());
        assertThat(assigned).containsExactlyInAnyOrder(201,409);
        assertThat(jdbc.queryForObject("select count(*) from reporting_grants",Integer.class)).isEqualTo(1);
        UUID candidate=capture(); List<Integer> published=race(()->publishStatus(candidate,admin),()->publishStatus(candidate,second));
        assertThat(published).containsExactlyInAnyOrder(200,409);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REPORT_SNAPSHOT_PUBLISHED'",Integer.class)).isEqualTo(1);
    }
    @Test void concurrentCandidatesAreCheckedAgainstTheCommittedFullTranscript() throws Exception {
        UUID f=facility("31","31.71"); List<UUID> cases=cohort(f,20,false); publish(capture(),200);
        for(int i=0;i<10;i++) jdbc.update("update tb_cases set status='COMPLETED' where id=?",cases.get(i)); UUID one=capture();
        jdbc.update("update tb_cases set status='ACTIVE'");
        for(int i=1;i<=10;i++) jdbc.update("update tb_cases set status='COMPLETED' where id=?",cases.get(i)); UUID two=capture();
        Cookie second=login("administrator@example.invalid");
        assertThat(race(()->publishStatus(one,admin),()->publishStatus(two,second))).containsExactlyInAnyOrder(200,409);
        assertThat(jdbc.queryForObject("select count(*) from reporting_snapshots where state='PUBLISHED'",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REPORT_PUBLICATION_WITHHELD'",Integer.class)).isEqualTo(1);
    }
    @Test void skewedApplicationClocksCannotRepublishAnOlderCapture() throws Exception {
        List<UUID> cases=cohort(facility("31","31.71"),10,false);
        var firstInstance=new ReportingPublicationService(access,catalogue,store,audit,Clock.fixed(Instant.parse("2030-01-01T10:02:00Z"),ZoneOffset.UTC));
        var secondInstance=new ReportingPublicationService(access,catalogue,store,audit,Clock.fixed(Instant.parse("2030-01-01T10:01:00Z"),ZoneOffset.UTC));
        UUID earlier=new TransactionTemplate(transactions).execute(t->firstInstance.capture(actor(administrator)).id());
        for(UUID c:cases) jdbc.update("update tb_cases set status='COMPLETED' where id=?",c);
        UUID newer=new TransactionTemplate(transactions).execute(t->secondInstance.capture(actor(administrator)).id());
        publish(newer,200); publish(earlier,409);
        assertThat(jdbc.queryForObject("select id from reporting_snapshots where state='PUBLISHED'",UUID.class)).isEqualTo(newer);
        assertThat(jdbc.queryForObject("select (public_data->'cells'->0->'indicators'->>'completedCaseEpisodes')::bigint from reporting_snapshots where id=?",Long.class,newer)).isEqualTo(10);
    }
    @Test void opposingAdministratorGrantOperationsUseCompatibleUserLockOrder() throws Exception {
        UUID a=UUID.fromString("00000000-0000-4000-8000-000000000001");
        UUID b=UUID.fromString("80000000-0000-4000-8000-000000000002");
        for(var entry:Map.of(a,"admin-a@example.invalid",b,"admin-b@example.invalid").entrySet()) {
            jdbc.update("insert into users(id,email,password_hash,status,email_verified_at) values (?,?,?,'ACTIVE',now())",entry.getKey(),entry.getValue(),hash);
            jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code in ('SYSTEM_ADMIN','PROGRAM_MONITOR')",entry.getKey());
        }
        Cookie first=login("admin-a@example.invalid"),second=login("admin-b@example.invalid");
        assertThat(race(()->mvc.perform(post(grantPath(b)).cookie(first).with(csrf()).contentType("application/json").content("{\"scope\":\"NATIONAL\"}")).andReturn().getResponse().getStatus(),
                ()->mvc.perform(post(grantPath(a)).cookie(second).with(csrf()).contentType("application/json").content("{\"scope\":\"NATIONAL\"}")).andReturn().getResponse().getStatus()))
                .containsExactly(201,201);
        assertThat(jdbc.queryForObject("select count(*) from reporting_grants",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REPORT_SCOPE_ASSIGNED'",Integer.class)).isEqualTo(2);
    }
    @Test void publisherRoleRevocationCommittedDuringAdmissionWaitPreventsPublication() throws Exception {
        UUID candidate=capture();
        try(var blocker=dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try(var statement=blocker.prepareStatement("select id from users where id=? for update")) {
                statement.setObject(1,administrator); statement.executeQuery().close();
            }
            blocker.createStatement().executeQuery("select id from reporting_publication_guard for update").close();
            try(var statement=blocker.prepareStatement("delete from user_roles where user_id=?")) {
                statement.setObject(1,administrator); statement.executeUpdate();
            }
            ExecutorService pool=Executors.newSingleThreadExecutor();
            try {
                var result=pool.submit(()->namedOperation("ga1-publisher-revocation",()->publications.publish(actor(administrator),candidate,"\"0\"")));
                awaitLockWait("ga1-publisher-revocation"); blocker.commit();
                assertThat(result.get(10,TimeUnit.SECONDS)).isEqualTo(403);
                assertThat(jdbc.queryForObject("select state from reporting_snapshots where id=?",String.class,candidate)).isEqualTo("DRAFT");
                assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REPORT_SNAPSHOT_PUBLISHED'",Integer.class)).isZero();
            } finally { blocker.rollback(); pool.shutdownNow(); }
        }
    }
    @Test void monitorRoleRevocationCommittedDuringGrantWaitPreventsRead() throws Exception {
        UUID monitor=user("monitor@example.invalid","PROGRAM_MONITOR"); UUID grant=grant(monitor,"NATIONAL",null); publish(capture(),200);
        try(var blocker=dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try(var statement=blocker.prepareStatement("select id from users where id=? for update")) {
                statement.setObject(1,monitor); statement.executeQuery().close();
            }
            try(var statement=blocker.prepareStatement("select id from reporting_grants where id=? for update")) {
                statement.setObject(1,grant); statement.executeQuery().close();
            }
            try(var statement=blocker.prepareStatement("delete from user_roles where user_id=?")) {
                statement.setObject(1,monitor); statement.executeUpdate();
            }
            ExecutorService pool=Executors.newSingleThreadExecutor();
            try {
                var result=pool.submit(()->namedOperation("ga1-reader-revocation",()->reports.summary(actor(monitor),null,null)));
                awaitLockWait("ga1-reader-revocation"); blocker.commit();
                assertThat(result.get(10,TimeUnit.SECONDS)).isEqualTo(403);
                assertThat(jdbc.queryForObject("select count(*) from audit_logs where action='REPORT_ACCESS_DENIED'",Integer.class)).isEqualTo(1);
            } finally { blocker.rollback(); pool.shutdownNow(); }
        }
    }
    @Test void delayedCaptureCannotSupersedeNewerDatabaseState() throws Exception {
        UUID facility=facility("31","31.71"); List<UUID> cases=cohort(facility,10,false);
        CountDownLatch paused=new CountDownLatch(1),resume=new CountDownLatch(1);
        doAnswer(invocation->{
            if(Thread.currentThread().getName().equals("ga1-delayed-capture")) {
                paused.countDown(); if(!resume.await(10,TimeUnit.SECONDS)) throw new AssertionError("Capture barrier timeout");
            }
            return invocation.callRealMethod();
        }).when(catalogue).requireVerified();
        ExecutorService old=Executors.newSingleThreadExecutor(r->new Thread(r,"ga1-delayed-capture"));
        ExecutorService next=Executors.newSingleThreadExecutor();
        try {
            var a=old.submit(()->publications.capture(actor(administrator)));
            assertThat(paused.await(5,TimeUnit.SECONDS)).isTrue();
            for(UUID c:cases) jdbc.update("update tb_cases set status='COMPLETED' where id=?",c);
            var b=next.submit(()->new TransactionTemplate(transactions).execute(t->{
                jdbc.execute("set local application_name='ga1-newer-capture'"); return publications.capture(actor(administrator));
            }));
            // Observe actual database blocking or completion; no assumption based on a timing sleep.
            awaitLockWaitOrCompletion("ga1-newer-capture",b);
            if(b.isDone()) publish(b.get(5,TimeUnit.SECONDS).id(),200);
            resume.countDown(); var earlier=a.get(5,TimeUnit.SECONDS); var newer=b.get(5,TimeUnit.SECONDS);
            if(!jdbc.queryForObject("select state='PUBLISHED' from reporting_snapshots where id=?",Boolean.class,newer.id())) publish(newer.id(),200);
            publish(earlier.id(),409);
            assertThat(jdbc.queryForObject("select (public_data->'cells'->0->'indicators'->>'completedCaseEpisodes')::bigint from reporting_snapshots where id=?",Long.class,newer.id())).isEqualTo(10);
        } finally { resume.countDown(); old.shutdownNow(); next.shutdownNow(); reset(catalogue); }
    }
    private CurrentActor actor(UUID user) { return new CurrentActor(user,null,null,Set.of(),Set.of(),Set.of(),null,Set.of()); }
    private int namedOperation(String name,Callable<?> operation) {
        try {
            new TransactionTemplate(transactions).execute(t->{
                jdbc.execute("set local application_name='"+name+"'");
                try { return operation.call(); } catch(RuntimeException e) { throw e; } catch(Exception e) { throw new IllegalStateException(e); }
            }); return 200;
        } catch(id.tbcall.application.common.ApplicationFailure failure) { return failure.status(); }
    }
    private void awaitLockWait(String name) throws Exception { awaitLockWaitOrCompletion(name,null); }
    private void awaitLockWaitOrCompletion(String name,Future<?> future) throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(System.nanoTime()<deadline) {
            if(future!=null && future.isDone()) return;
            if(Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from pg_stat_activity where application_name=? and wait_event_type='Lock')",Boolean.class,name))) return;
            Thread.sleep(10);
        }
        throw new AssertionError("Expected bounded database lock wait was not observed");
    }
    private List<Integer> race(Callable<Integer> a,Callable<Integer> b) throws Exception {
        ExecutorService pool=Executors.newFixedThreadPool(2); CountDownLatch start=new CountDownLatch(1);
        try { var one=pool.submit(()->{start.await();return a.call();}); var two=pool.submit(()->{start.await();return b.call();}); start.countDown();
            return List.of(one.get(20,TimeUnit.SECONDS),two.get(20,TimeUnit.SECONDS));
        } finally { pool.shutdownNow(); }
    }
    private JsonNode node(String value) { return json.readTree(value); }
    private JsonNode read(Cookie cookie,String endpoint,String query,int expected) throws Exception {
        var response=mvc.perform(get("/api/v1/program-reports/"+endpoint+query).cookie(cookie)).andExpect(status().is(expected)).andReturn().getResponse();
        if(expected==200) assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        return node(response.getContentAsString());
    }
    private String grantPath(UUID user) { return "/api/v1/admin/users/"+user+"/reporting-scopes"; }
    private UUID grant(UUID user,String scope,String code) throws Exception {
        Map<String,Object> body=new HashMap<>(); body.put("scope",scope); if(code!=null) body.put("regionCode",code);
        return UUID.fromString(node(mvc.perform(post(grantPath(user)).cookie(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asText());
    }
    private UUID capture() throws Exception {
        return UUID.fromString(node(mvc.perform(post("/api/v1/admin/reporting-snapshots").cookie(admin).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asText());
    }
    private void publish(UUID id,int expected) throws Exception { assertThat(publishStatus(id,admin)).isEqualTo(expected); }
    private int publishStatus(UUID id,Cookie actor) throws Exception {
        return mvc.perform(post("/api/v1/admin/reporting-snapshots/"+id+"/publish").cookie(actor).with(csrf()).header("If-Match","\"0\"").contentType("application/json").content("{\"approved\":true}")).andReturn().getResponse().getStatus();
    }
    private UUID facility(String province,String regency) { return jdbc.queryForObject("insert into facilities(name,province_code,regency_code) values ('Fictional reporting facility',?,?) returning id",UUID.class,province,regency); }
    private UUID patient() { return jdbc.queryForObject("insert into patients(full_name,nik,bpjs_number,phone,address) values ('Fictional private patient',null,null,'PRIVATE-PHONE','PRIVATE-NOTE') returning id",UUID.class); }
    private UUID tbCase(UUID patient,UUID facility,String status) {
        UUID registration=jdbc.queryForObject("insert into tb_registrations(patient_id,facility_id,registration_date,status) values (?,?,current_date,'CONVERTED_TO_CASE') returning id",UUID.class,patient,facility);
        return jdbc.queryForObject("insert into tb_cases(registration_id,current_facility_id,status) values (?,?,?) returning id",UUID.class,registration,facility,status);
    }
    private UUID treatment(UUID owner,UUID facility,String status) { return jdbc.queryForObject("insert into treatments(case_id,facility_id,start_date,status,notes) values (?,?,current_date,?,'PRIVATE-NOTE') returning id",UUID.class,owner,facility,status); }
    private List<UUID> cohort(UUID facility,int count,boolean history) {
        List<UUID> cases=new ArrayList<>();
        for(int i=0;i<count;i++) { UUID patient=patient(); UUID active=tbCase(patient,facility,"ACTIVE"); cases.add(active); treatment(active,facility,"ACTIVE");
            if(history) { UUID past=tbCase(patient,facility,"COMPLETED"),t=treatment(past,facility,"COMPLETED");
                jdbc.update("insert into treatment_outcomes(treatment_id,outcome_code,outcome_date,notes) values (?,(select code from treatment_outcome_codes order by code limit 1),current_date,'PRIVATE-NOTE')",t); }
        }
        return cases;
    }
    private void permission(String role,String permission,boolean grant) {
        if(grant) jdbc.update("insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r,permissions p where r.code=? and p.code=? on conflict do nothing",role,permission);
        else jdbc.update("delete from role_permissions where role_id=(select id from roles where code=?) and permission_id=(select id from permissions where code=?)",role,permission);
    }
    UUID user(String email,String role) {
        UUID id=jdbc.queryForObject("insert into users(email,password_hash,status,email_verified_at) values (?,?,'ACTIVE',now()) returning id",UUID.class,email,hash);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?",id,role);
        return id;
    }
    Cookie login(String email) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("identity",email,"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("TBCALL_SESSION");
    }
}
