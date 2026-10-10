package id.tbcall.application;

import id.tbcall.application.clinical.*;
import id.tbcall.application.common.AuditService;
import id.tbcall.application.dashboard.*;
import id.tbcall.application.laboratory.LabAccess;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.*;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class OperationalDashboardReadTest {
    static final String PATH="/api/v1/operational-dashboard";
    static final Set<String> ALL=Set.of("CASE_READ","TREATMENT_READ","FOLLOW_UP_READ","LAB_REQUEST_READ");
    final UUID facility=UUID.randomUUID();
    EntityManager em; AuditService audit; MockMvc mvc;
    Map<Class<?>,TypedQuery<?>> queries;
    @SuppressWarnings("unchecked") <T> TypedQuery<T> query(Class<T> type) { return (TypedQuery<T>)queries.get(type); }
    @BeforeEach void setup() {
        em=mock(EntityManager.class); audit=mock(AuditService.class); queries=new HashMap<>();
        for(Class<?> type:List.of(Long.class,FollowUp.class,LabRequest.class)) {
            TypedQuery<?> q=mock(TypedQuery.class,RETURNS_SELF); queries.put(type,q); doReturn(List.of()).when(q).getResultList();
        }
        when(query(Long.class).getSingleResult()).thenReturn(0L);
        when(em.createQuery(anyString(),any())).thenAnswer(call -> queries.get(call.getArgument(1)));
        var service=new OperationalDashboardService(em,new ClinicalAccess(em,audit),new ClinicalViews(em),new LabAccess(em,audit),Clock.fixed(Instant.parse("2026-10-11T00:00:00Z"),ZoneOffset.UTC));
        mvc=MockMvcBuilders.standaloneSetup(new OperationalDashboardController(service)).setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new ApiExceptionHandler(new ProblemResponses(tools.jackson.databind.json.JsonMapper.builder().build()))).build();
        actor("TB_OFFICER",ALL,Set.of(facility));
    }
    void actor(String role,Set<String> permissions,Set<UUID> facilities) {
        var actor=new CurrentActor(UUID.randomUUID(),UUID.randomUUID(),null,Set.of(role),permissions,facilities,null,Set.of());
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(actor,null));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void caseOnlyPermissionDoesNotRequireOtherDomains() throws Exception {
        actor("TB_OFFICER",Set.of("CASE_READ"),Set.of(facility)); when(query(Long.class).getSingleResult()).thenReturn(7L,3L);
        mvc.perform(get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.cases.data.active").value(7)).andExpect(jsonPath("$.cases.data.completed").value(3))
                .andExpect(jsonPath("$.followUps.state").value("PERMISSION_DENIED")).andExpect(jsonPath("$.laboratory.data").isEmpty());
        verify(em,never()).createQuery(anyString(),eq(FollowUp.class)); verify(em,never()).createQuery(anyString(),eq(LabRequest.class));
    }
    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER","LAB_STAFF","FACILITY_ADMIN","SYSTEM_ADMIN","PROGRAM_MONITOR"})
    void incorrectRoleIsDeniedEvenWithAllReadPermissions(String role) throws Exception {
        actor(role,ALL,Set.of(facility)); mvc.perform(get(PATH)).andExpect(status().isForbidden()); verifyNoInteractions(em); verify(audit).authorizationDenied(any());
    }
    @Test void noAssignmentAndNoEligiblePermissionAreDenied() throws Exception {
        actor("TB_OFFICER",ALL,Set.of()); mvc.perform(get(PATH)).andExpect(status().isForbidden());
        actor("TB_OFFICER",Set.of("PATIENT_READ","FOLLOW_UP_READ"),Set.of(facility)); mvc.perform(get(PATH)).andExpect(status().isForbidden()); verifyNoInteractions(em);
    }
    @ParameterizedTest @ValueSource(strings={"TREATMENT_READ","FOLLOW_UP_READ","LAB_REQUEST_READ"})
    void independentPermissionsHideCountsAndQueries(String missing) throws Exception {
        Set<String> perms=new HashSet<>(ALL); perms.remove(missing); actor("TB_OFFICER",perms,Set.of(facility));
        String section=missing.equals("LAB_REQUEST_READ") ? "laboratory" : "followUps";
        mvc.perform(get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$."+section+".state").value("PERMISSION_DENIED")).andExpect(jsonPath("$."+section+".data").isEmpty());
        if(missing.equals("LAB_REQUEST_READ")) verify(em,never()).createQuery(anyString(),eq(LabRequest.class));
        else verify(em,never()).createQuery(anyString(),eq(FollowUp.class));
    }
    @Test void followUpOnlyAndLabOnlyReadersDoNotNeedCaseRead() throws Exception {
        actor("TB_OFFICER",Set.of("TREATMENT_READ","FOLLOW_UP_READ"),Set.of(facility));
        mvc.perform(get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.cases.data").isEmpty()).andExpect(jsonPath("$.followUps.data.upcoming.totalElements").value(0));
        actor("TB_OFFICER",Set.of("LAB_REQUEST_READ"),Set.of(facility));
        mvc.perform(get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.cases.data").isEmpty()).andExpect(jsonPath("$.laboratory.data.totalElements").value(0));
    }
    @Test void independentPagesAreBoundedAndSnapshotHasExplicitSevenDayWindow() throws Exception {
        mvc.perform(get(PATH).param("upcomingPage","1").param("overduePage","2").param("labPage","3"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.asOf").value("2026-10-11T00:00:00Z")).andExpect(jsonPath("$.upcomingUntil").value("2026-10-18T00:00:00Z"));
        verify(query(FollowUp.class)).setFirstResult(10); verify(query(FollowUp.class)).setFirstResult(20); verify(query(LabRequest.class)).setFirstResult(30);
        verify(query(FollowUp.class),times(2)).setMaxResults(10); verify(query(LabRequest.class)).setMaxResults(10);
        verify(query(LabRequest.class)).setParameter("facilities",Set.of(facility)); verify(query(LabRequest.class)).setParameter("officer",true); verify(query(LabRequest.class)).setParameter("lab",false);
    }
    @ParameterizedTest @ValueSource(strings={"upcomingPage=-1","overduePage=2147483647","labPage=-1","facilityId=foreign","size=1000"})
    void unapprovedFiltersAndInvalidPagesAreRejected(String input) throws Exception {
        var pair=input.split("=",2); mvc.perform(get(PATH).param(pair[0],pair[1])).andExpect(status().isBadRequest()); verifyNoInteractions(em);
    }
    @Test void readProjectionExcludesPrivateIdentityAndClinicalNotes() throws Exception {
        Facility f=new Facility(); f.setId(facility); f.setName("Fictional facility");
        Patient p=new Patient(); p.setFullName("Fictional patient"); p.setNik("PRIVATE-NIK"); p.setAddress("PRIVATE-ADDRESS");
        TBRegistration reg=new TBRegistration(); reg.setPatient(p);
        TBCase c=new TBCase(); c.setRegistration(reg); c.setHivStatusCode("PRIVATE-HIV");
        Treatment t=new Treatment(); t.setId(UUID.randomUUID()); t.setTbCase(c); t.setNotes("PRIVATE-TREATMENT");
        FollowUp follow=new FollowUp(); follow.setId(UUID.randomUUID()); follow.setTreatment(t); follow.setFollowUpType("Recorded follow-up"); follow.setScheduledAt(OffsetDateTime.parse("2026-10-12T00:00:00Z")); follow.setNotes("PRIVATE-NOTES");
        LabRequest lab=new LabRequest(); lab.setId(UUID.randomUUID()); lab.setTbCase(c); lab.setRequestingFacility(f); lab.setTestingFacility(f); lab.setStatus("PARTIAL"); lab.setNotes("PRIVATE-LAB");
        when(query(FollowUp.class).getResultList()).thenReturn(List.of(follow)); when(query(LabRequest.class).getResultList()).thenReturn(List.of(lab));
        String body=mvc.perform(get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.followUps.data.upcoming.content[0].facility").isEmpty()).andReturn().getResponse().getContentAsString();
        assertThat(body).contains("Fictional patient").doesNotContain("PRIVATE-","weightKg","symptomSummary","resultText","patientId","regimen");
        mvc.perform(post(PATH)).andExpect(status().isMethodNotAllowed()); verify(em,never()).persist(any()); verify(em,never()).merge(any());
    }
}
