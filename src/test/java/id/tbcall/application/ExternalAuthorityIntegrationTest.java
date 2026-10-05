package id.tbcall.application;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.persistence.repository.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = "tbcall.monitoring.scheduler-enabled=false")
@ActiveProfiles("test") @Testcontainers @Transactional
class ExternalAuthorityIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl); r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired ClinicalSourceAuthorityPolicy clinical;
    @Autowired LaboratorySourceAuthorityPolicy laboratory;
    @Autowired ReferralSourceAuthorityPolicy referral;
    @Autowired ContactSourceAuthorityPolicy contact;
    @Autowired MonitoringSourceAuthorityPolicy monitoring;
    @Autowired ExternalAuthorityRegistry registry;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;
    @Autowired ExternalSourceAuthorityRepository authorities;
    @Autowired IntegrationConflictRepository conflicts;
    @Autowired SyncItemRepository items;
    private final UUID facility = UUID.randomUUID(), target = UUID.randomUUID();
    private final Set<String> permissions = Set.of("PATIENT_UPDATE", "LAB_REQUEST_WRITE", "REFERRAL_WRITE", "CONTACT_WRITE", "TPT_WRITE", "MONITORING_MANAGE");

    static Stream<Arguments> policyMatrix() {
        return Stream.of("CLINICAL", "LABORATORY", "REFERRAL", "CONTACT", "INVESTIGATION", "TPT", "MONITORING")
                .flatMap(f -> Stream.of("NONE", "MATCHING", "WRONG_SCOPE", "RELEASED", "IDENTIFIER_ONLY", "WRONG_ENTITY", "WRONG_TYPE", "PARENT")
                        .map(mode -> Arguments.of(f, mode)));
    }

    @ParameterizedTest @MethodSource("policyMatrix")
    void onlyExactActiveEntityAndScopeBlocksTheExistingPolicy(String family, String mode) {
        String type = type(family), scope = scope(family);
        if (mode.equals("IDENTIFIER_ONLY")) {
            jdbc.update("insert into external_identifiers(external_system_id,entity_type,entity_id,external_id) values (?,?,?,?)",
                    system(), type, target, "identifier-only");
        } else if (!mode.equals("NONE")) {
            UUID row = authority(mode.equals("WRONG_TYPE") ? "UNRELATED" : mode.equals("PARENT") ? "TB_CASE" : type,
                    mode.equals("WRONG_ENTITY") ? UUID.randomUUID() : target,
                    mode.equals("WRONG_SCOPE") ? (scope.equals("CLINICAL") ? "MONITORING" : "CLINICAL") : scope);
            if (mode.equals("RELEASED")) jdbc.update("update external_source_authorities set released_at=effective_at where id=?", row);
        }
        if (mode.equals("MATCHING")) {
            assertThatThrownBy(() -> invoke(family, actor(Set.of("TB_OFFICER"), Set.of(facility)), target))
                    .isInstanceOf(ApplicationFailure.class).satisfies(error -> {
                        var failure = (ApplicationFailure) error;
                        assertThat(failure.status()).isEqualTo(409);
                        assertThat(failure.code()).isEqualTo("SOURCE_AUTHORITY_CONFLICT");
                        assertThat(failure.title()).isEqualTo("Sumber data tidak mengizinkan perubahan lokal");
                        assertThat(failure.getMessage()).doesNotContain("identifier-only", "SITB", target.toString());
                    });
        } else assertThatCode(() -> invoke(family, actor(Set.of("TB_OFFICER"), Set.of(facility)), target)).doesNotThrowAnyException();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select active from external_systems where code='SITB'", Boolean.class)).isFalse();
    }

    static Stream<Arguments> deniedActors() {
        return Stream.of("CLINICAL", "LABORATORY", "REFERRAL", "CONTACT", "INVESTIGATION", "TPT", "MONITORING")
                .flatMap(f -> Stream.of("ROLE", "PERMISSION", "FACILITY").map(reason -> Arguments.of(f, reason)));
    }
    @ParameterizedTest @MethodSource("deniedActors")
    void accessChecksPrecedeSourceAuthority(String family, String reason) {
        authority(type(family), target, scope(family));
        var actor = reason.equals("PERMISSION")
                ? new CurrentActor(UUID.randomUUID(), UUID.randomUUID(), null, Set.of("TB_OFFICER"), Set.of(), Set.of(facility), null, Set.of())
                : actor(reason.equals("ROLE") ? Set.of("SYSTEM_ADMIN") : Set.of("TB_OFFICER"),
                        reason.equals("FACILITY") ? Set.of(UUID.randomUUID()) : Set.of(facility));
        assertThatThrownBy(() -> invoke(family, actor, target)).isInstanceOf(ApplicationFailure.class)
                .satisfies(error -> assertThat(((ApplicationFailure) error).status()).isEqualTo(403));
    }

    @ParameterizedTest @ValueSource(strings = {"CLINICAL", "LABORATORY", "REFERRAL", "CONTACT", "INVESTIGATION", "TPT", "MONITORING"})
    void newEntityWithoutIdDoesNotInheritParentAuthority(String family) {
        authority(type(family), target, scope(family));
        authority("TB_CASE", target, scope(family));
        var actor = actor(Set.of("TB_OFFICER"), Set.of(facility));
        assertThatCode(() -> {
            switch (family) {
                case "CLINICAL" -> clinical.requireLocalCreate(actor, "PATIENT_UPDATE", facility, "PATIENT");
                case "LABORATORY" -> laboratory.requireLocalCreate(actor, "LAB_REQUEST_WRITE", facility, "LAB_REQUEST");
                case "REFERRAL" -> referral.requireLocalCreate(actor, "REFERRAL_WRITE", facility, target);
                default -> invoke(family, actor, null);
            }
        }).doesNotThrowAnyException();
    }

    @Test void newJpaMappingsRoundTripHashesHistoryAndConflictLink() {
        var system = em.getReference(ExternalSystem.class, system());
        var authority = new ExternalSourceAuthority(); authority.setExternalSystem(system);
        authority.setEntityType("PATIENT"); authority.setEntityId(target); authority.setAuthorityScope("CLINICAL");
        authority.setExternalId("external-authority"); authority.setSourceVersion("source-v1");
        authorities.saveAndFlush(authority); em.refresh(authority);
        assertThat(authority.getEffectiveAt()).isNotNull(); assertThat(authority.getCreatedAt()).isNotNull();
        authority.setReleasedAt(authority.getEffectiveAt()); authorities.saveAndFlush(authority);
        var conflict = new IntegrationConflict(); conflict.setExternalSystem(system); conflict.setEntityType("PATIENT");
        conflict.setEntityId(target); conflict.setExternalId("external-conflict"); conflict.setAuthorityScope("CLINICAL");
        conflict.setLocalContentHash("local"); conflict.setSourceContentHash("source"); conflict.setSourceVersion("v2");
        conflicts.saveAndFlush(conflict); em.refresh(conflict);
        assertThat(conflict.getStatus()).isEqualTo("OPEN"); assertThat(conflict.getFirstSeenAt()).isNotNull(); assertThat(conflict.getLastSeenAt()).isNotNull();
        var run = new SyncRun(); run.setExternalSystem(system); em.persist(run);
        var item = new SyncItem(); item.setSyncRun(run); item.setEntityType("PATIENT"); item.setExternalId("external-conflict");
        item.setOperation("UPSERT"); item.setStatus("PENDING"); item.setLocalContentHash("local"); item.setConflict(conflict);
        items.saveAndFlush(item); UUID itemId = item.getId(), authorityId = authority.getId(); em.clear();
        var saved = items.findById(itemId).orElseThrow();
        assertThat(saved.getLocalContentHash()).isEqualTo("local"); assertThat(saved.getRawPayload()).isNull();
        assertThat(saved.getConflict().getSourceContentHash()).isEqualTo("source");
        assertThat(saved.getConflict().getExternalSystem().getCode()).isEqualTo("SITB");
        assertThat(authorities.findById(authorityId).orElseThrow().getReleasedAt()).isNotNull();
    }

    @ParameterizedTest @ValueSource(strings = {"CLINICAL", "LABORATORY", "REFERRAL", "CONTACT_TPT", "MONITORING"})
    void registryReturnsOnlyExactActiveDescriptorAndTreatsReleaseAsLocal(String scope) {
        UUID id = authority("PATIENT", target, scope);
        jdbc.update("update external_source_authorities set external_id='descriptor-record',source_version='version-2' where id=?", id);
        var descriptor = registry.activeAuthority("PATIENT", target, scope).orElseThrow();
        assertThat(descriptor.id()).isEqualTo(id); assertThat(descriptor.externalSystemId()).isEqualTo(system());
        assertThat(descriptor.entityType()).isEqualTo("PATIENT"); assertThat(descriptor.entityId()).isEqualTo(target);
        assertThat(descriptor.authorityScope()).isEqualTo(scope); assertThat(descriptor.externalId()).isEqualTo("descriptor-record");
        assertThat(descriptor.sourceVersion()).isEqualTo("version-2"); assertThat(descriptor.effectiveAt()).isNotNull();
        assertThat(registry.isExternallyAuthoritative("PATIENT", target, scope)).isTrue();
        assertThat(registry.activeAuthority("PATIENT", null, scope)).isEmpty();
        jdbc.update("update external_source_authorities set released_at=effective_at where id=?", id);
        assertThat(registry.activeAuthority("PATIENT", target, scope)).isEmpty();
        assertThat(registry.isExternallyAuthoritative("PATIENT", target, scope)).isFalse();
    }

    @Test void registryDoesNotAcceptAnUnapprovedApplicationScope() {
        assertThatThrownBy(() -> registry.requireLocallyWritable("PATIENT", target, "UNAPPROVED"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private void invoke(String family, CurrentActor actor, UUID id) {
        switch (family) {
            case "CLINICAL" -> clinical.requireLocalEdit(actor, "PATIENT_UPDATE", facility, "PATIENT", id);
            case "LABORATORY" -> laboratory.requireLocalEdit(actor, "LAB_REQUEST_WRITE", facility, "LAB_REQUEST", id);
            case "REFERRAL" -> referral.requireLocalTransition(actor, "REFERRAL_WRITE", facility, id);
            case "CONTACT" -> contact.requireLocalContactWrite(actor, "CONTACT_WRITE", facility, target, id);
            case "INVESTIGATION" -> contact.requireLocalInvestigationTransition(actor, "CONTACT_WRITE", facility, id);
            case "TPT" -> contact.requireLocalTptWrite(actor, "TPT_WRITE", facility, target, id);
            case "MONITORING" -> monitoring.requireLocalManage(actor, "MONITORING_MANAGE", facility, id);
            default -> throw new IllegalArgumentException(family);
        }
    }
    private UUID authority(String type, UUID id, String scope) {
        return jdbc.queryForObject("insert into external_source_authorities(external_system_id,entity_type,entity_id,authority_scope) values (?,?,?,?) returning id",
                UUID.class, system(), type, id, scope);
    }
    private UUID system() { return jdbc.queryForObject("select id from external_systems where code='SITB'", UUID.class); }
    private CurrentActor actor(Set<String> roles, Set<UUID> facilities) {
        return new CurrentActor(UUID.randomUUID(), UUID.randomUUID(), null, roles, permissions, facilities, null, Set.of());
    }
    private static String scope(String family) { return Set.of("CONTACT", "INVESTIGATION", "TPT").contains(family) ? "CONTACT_TPT" : family; }
    private static String type(String family) {
        return switch (family) {
            case "CLINICAL" -> "PATIENT"; case "LABORATORY" -> "LAB_REQUEST"; case "REFERRAL" -> "REFERRAL";
            case "CONTACT" -> "CONTACT"; case "INVESTIGATION" -> "CONTACT_INVESTIGATION";
            case "TPT" -> "PREVENTIVE_TREATMENT"; case "MONITORING" -> "MONITORING_PLAN";
            default -> throw new IllegalArgumentException(family);
        };
    }
}
