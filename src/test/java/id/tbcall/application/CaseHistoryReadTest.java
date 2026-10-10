package id.tbcall.application;

import id.tbcall.application.clinical.*;
import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.*;
import jakarta.persistence.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Pure MVC/service checks: no Spring context, database or Testcontainers. */
class CaseHistoryReadTest {
    EntityManager em;
    TypedQuery<Long> count;
    TypedQuery<TBCase> rows;
    AuditService audit;
    MockMvc mvc;
    final UUID facility=UUID.fromString("00000000-0000-4000-8000-000000000001");

    @SuppressWarnings("unchecked")
    @BeforeEach void setup() {
        em=mock(EntityManager.class); audit=mock(AuditService.class);
        count=mock(TypedQuery.class,RETURNS_SELF); rows=mock(TypedQuery.class,RETURNS_SELF);
        when(em.createQuery(anyString(),eq(Long.class))).thenReturn(count);
        when(em.createQuery(anyString(),eq(TBCase.class))).thenReturn(rows);
        when(count.getSingleResult()).thenReturn(0L); when(rows.getResultList()).thenReturn(List.of());
        var query=new ClinicalQueryService(em,new ClinicalAccess(em,audit),new ClinicalViews(em));
        mvc=MockMvcBuilders.standaloneSetup(new ClinicalIntakeController(null,null,null,null,null,query))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new ApiExceptionHandler(new ProblemResponses(tools.jackson.databind.json.JsonMapper.builder().build()))).build();
        actor("TB_OFFICER",Set.of("CASE_READ"),Set.of(facility));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void actor(String role,Set<String> permissions,Set<UUID> facilities) {
        var actor=new CurrentActor(UUID.randomUUID(),UUID.randomUUID(),null,Set.of(role),permissions,facilities,null,Set.of());
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(actor,null));
    }
    @Test void completedHistoryIsASeparatePaginatedRead() throws Exception {
        mvc.perform(get("/api/v1/cases/history")).andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty()).andExpect(jsonPath("$.size").value(20));
    }
    @Test void historyReturnsOnlyTheSmallCaseProjectionWithBothQueriesScopedAndBounded() throws Exception {
        Patient p=new Patient(); p.setId(UUID.randomUUID()); p.setFullName("Fictional history"); p.setNik("1234567890123456"); p.setAddress("Private fixture address");
        Facility f=new Facility(); f.setId(facility); f.setName("Synthetic facility");
        TBRegistration r=new TBRegistration(); r.setPatient(p);
        TBCase c=new TBCase(); c.setId(UUID.randomUUID()); c.setVersion(0L); c.setRegistration(r); c.setStatus("COMPLETED"); c.setCurrentFacility(f);
        @SuppressWarnings("unchecked") TypedQuery<Object[]> catalog=mock(TypedQuery.class,RETURNS_SELF);
        when(em.createQuery(anyString(),eq(Object[].class))).thenReturn(catalog); when(catalog.getResultList()).thenReturn(List.of());
        when(count.getSingleResult()).thenReturn(1L); when(rows.getResultList()).thenReturn(List.of(c));
        mvc.perform(get("/api/v1/cases/history").param("page","2").param("size","10").param("name","  Fictional_%!  ").param("facilityId",facility.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].fullName").value("Fictional history"))
                .andExpect(jsonPath("$.content[0].tbCase.status").value("COMPLETED"))
                .andExpect(jsonPath("$.content[0].nik").doesNotExist()).andExpect(jsonPath("$.content[0].address").doesNotExist());
        var sql=ArgumentCaptor.forClass(String.class); verify(em).createQuery(sql.capture(),eq(Long.class));
        assertThat(sql.getValue()).contains("c.status='COMPLETED'","c.currentFacility.id in :facilities","c.currentFacility.active=true");
        verify(em).createQuery(sql.capture(),eq(TBCase.class));
        assertThat(sql.getValue()).contains("c.status='COMPLETED'","c.currentFacility.id in :facilities","c.currentFacility.active=true","order by c.confirmedAt desc nulls last,c.id");
        verify(count).setParameter("facilities",Set.of(facility)); verify(rows).setParameter("facilities",Set.of(facility));
        verify(count).setParameter("name","%fictional!_!%!!%"); verify(rows).setParameter("name","%fictional!_!%!!%");
        verify(rows).setFirstResult(20); verify(rows).setMaxResults(10);
        verifyNoInteractions(audit);
    }
    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER","LAB_STAFF","FACILITY_ADMIN","SYSTEM_ADMIN","PROGRAM_MONITOR"})
    void anotherRoleCannotDiscoverHistoryEvenWithCaseRead(String role) throws Exception {
        actor(role,Set.of("CASE_READ"),Set.of(facility));
        mvc.perform(get("/api/v1/cases/history")).andExpect(status().isForbidden());
        verifyNoInteractions(em); verify(audit).authorizationDenied(any());
    }
    @Test void missingPermissionAndMissingFacilityFailBeforeQueryingRecords() throws Exception {
        actor("TB_OFFICER",Set.of(),Set.of(facility)); mvc.perform(get("/api/v1/cases/history")).andExpect(status().isForbidden());
        actor("TB_OFFICER",Set.of("CASE_READ"),Set.of()); mvc.perform(get("/api/v1/cases/history")).andExpect(status().isForbidden());
        verifyNoInteractions(em);
    }
    @Test void aForeignFacilityFilterReturnsNotFoundWithoutQueryingRecords() throws Exception {
        mvc.perform(get("/api/v1/cases/history").param("facilityId",UUID.randomUUID().toString())).andExpect(status().isNotFound());
        verifyNoInteractions(em);
    }
    @ParameterizedTest @ValueSource(strings={"page=-1","page=2147483647","size=0","size=51","name=ab","caseStatus=ACTIVE","nik=1234567890123456"})
    void invalidOrUnapprovedHistoryFiltersAreRejected(String parameter) throws Exception {
        String[] pair=parameter.split("=",2);
        mvc.perform(get("/api/v1/cases/history").param(pair[0],pair[1])).andExpect(status().isBadRequest());
        verifyNoInteractions(em);
    }
}
