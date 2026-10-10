package id.tbcall.application;

import id.tbcall.web.*;
import id.tbcall.application.clinical.*;
import id.tbcall.application.common.*;
import id.tbcall.application.laboratory.LabAccess;
import id.tbcall.application.treatment.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.time.*;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Pure MVC checks; no Spring context, database or Testcontainers. */
class CaseSummaryReadTest {
    final UUID id=UUID.fromString("00000000-0000-4000-8000-000000000001"),facility=UUID.randomUUID();
    EntityManager em; AuditService audit; MockMvc mvc; TBCase c; TBRegistration r;
    Map<Class<?>,TypedQuery<?>> queries;
    @SuppressWarnings("unchecked") <T> TypedQuery<T> query(Class<T> type) { return (TypedQuery<T>)queries.get(type); }
    @BeforeEach void setup() {
        em=mock(EntityManager.class); audit=mock(AuditService.class); queries=new HashMap<>();
        for(Class<?> type:List.of(TBCase.class,TBRegistration.class,Diagnosis.class,LabRequest.class,Treatment.class,TreatmentDrug.class,DoseEvent.class,FollowUp.class,TreatmentOutcome.class,UUID.class,Long.class,Object[].class)) {
            TypedQuery<?> q=mock(TypedQuery.class,RETURNS_SELF); queries.put(type,q); doReturn(List.of()).when(q).getResultList();
        }
        when(query(Long.class).getSingleResult()).thenReturn(0L);
        when(em.createQuery(anyString(),any())).thenAnswer(invocation -> queries.get(invocation.getArgument(1)));
        Facility f=new Facility(); f.setId(facility); f.setName("Fictional facility"); f.setActive(true);
        Patient p=new Patient(); p.setId(UUID.randomUUID()); p.setFullName("Fictional summary"); p.setNik("PRIVATE-NIK"); p.setAddress("PRIVATE-ADDRESS");
        r=new TBRegistration(); r.setId(UUID.randomUUID()); r.setFacility(f); r.setPatient(p); r.setRegistrationDate(LocalDate.of(2026,1,1)); r.setStatus("CONVERTED_TO_CASE");
        c=new TBCase(); c.setId(id); c.setRegistration(r); c.setCurrentFacility(f); c.setStatus("ACTIVE"); c.setHivStatusCode("PRIVATE-HIV"); c.setDmStatusCode("PRIVATE-DM");
        when(query(TBCase.class).getResultList()).thenReturn(List.of(c)); when(query(TBRegistration.class).getResultList()).thenReturn(List.of(r)); when(query(UUID.class).getResultList()).thenReturn(List.of(id));
        when(em.find(TBCase.class,id)).thenReturn(c);
        var clinical=new ClinicalAccess(em,audit); var service=new CaseSummaryService(em,clinical,new ClinicalViews(em),new LabAccess(em,audit),new TreatmentAccess(em,clinical,audit),new TreatmentViews(em));
        mvc=MockMvcBuilders.standaloneSetup(new CaseSummaryController(service)).setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new ApiExceptionHandler(new ProblemResponses(tools.jackson.databind.json.JsonMapper.builder().build()))).build();
        actor("TB_OFFICER",Set.of("CASE_READ"),Set.of(facility));
    }
    void actor(String role,Set<String> permissions,Set<UUID> facilities) {
        var actor=new CurrentActor(UUID.randomUUID(),UUID.randomUUID(),null,Set.of(role),permissions,facilities,null,Set.of());
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(actor,null));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void anAuthorizedCaseHasAReadOnlySummaryRoute() throws Exception {
        var result=mvc.perform(get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.fullName").value("Fictional summary"))
                .andExpect(jsonPath("$.laboratory.state").value("PERMISSION_DENIED")).andExpect(jsonPath("$.laboratory.data").isEmpty())
                .andExpect(jsonPath("$.treatments.state").value("PERMISSION_DENIED")).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("PRIVATE-NIK","PRIVATE-ADDRESS","PRIVATE-HIV","PRIVATE-DM","totalElements","adherenceSummary");
        verify(em,never()).createQuery(anyString(),eq(Long.class));
    }
    @ParameterizedTest @ValueSource(strings={"PATIENT","TREATMENT_SUPPORTER","LAB_STAFF","FACILITY_ADMIN","SYSTEM_ADMIN","PROGRAM_MONITOR"})
    void wrongRolesCannotLoadAnySummarySection(String role) throws Exception {
        actor(role,Set.of("CASE_READ"),Set.of(facility)); mvc.perform(get(path())).andExpect(status().isForbidden()); verifyNoInteractions(em); verify(audit).authorizationDenied(any());
    }
    @Test void missingCasePermissionAndForeignCaseFailBeforeChildReads() throws Exception {
        actor("TB_OFFICER",Set.of(),Set.of(facility)); mvc.perform(get(path())).andExpect(status().isForbidden()); verifyNoInteractions(em);
        actor("TB_OFFICER",Set.of("CASE_READ"),Set.of(facility)); when(query(TBCase.class).getResultList()).thenReturn(List.of());
        mvc.perform(get(path())).andExpect(status().isNotFound()); verify(em,never()).createQuery(anyString(),eq(Long.class));
    }
    @Test void originalRegistrationScopeStillGatesDiagnosisAfterCaseTransfer() throws Exception {
        Facility old=new Facility(); old.setId(UUID.randomUUID()); old.setActive(true); r.setFacility(old);
        actor("TB_OFFICER",Set.of("CASE_READ","REGISTRATION_READ","DIAGNOSIS_READ"),Set.of(facility));
        mvc.perform(get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.registration.state").value("OUT_OF_SCOPE"))
                .andExpect(jsonPath("$.diagnoses.data").isEmpty()); verify(em,never()).createQuery(anyString(),eq(Diagnosis.class));
    }
    @ParameterizedTest @ValueSource(strings={"LAB_REQUEST_READ","LAB_RESULT_READ"})
    void eitherMissingLabPermissionHidesTheWholeSectionAndExistence(String permission) throws Exception {
        actor("TB_OFFICER",Set.of("CASE_READ",permission),Set.of(facility)); mvc.perform(get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.laboratory.state").value("PERMISSION_DENIED")).andExpect(jsonPath("$.laboratory.data").isEmpty());
        verify(em,never()).createQuery(anyString(),eq(LabRequest.class)); verify(em,never()).createQuery(anyString(),eq(Object[].class));
    }
    @Test void allowedEmptyPagesRemainDistinctFromDeniedPagesAndQueriesAreScopedAndBounded() throws Exception {
        actor("TB_OFFICER",Set.of("CASE_READ","DIAGNOSIS_READ","LAB_REQUEST_READ","LAB_RESULT_READ","TREATMENT_READ"),Set.of(facility));
        mvc.perform(get(path()).param("diagnosisPage","1").param("labPage","2").param("treatmentPage","3"))
                .andDo(result -> { if(result.getResolvedException()!=null) throw new AssertionError("Unexpected summary error",result.getResolvedException()); }).andExpect(status().isOk())
                .andExpect(jsonPath("$.laboratory.state").value("AVAILABLE")).andExpect(jsonPath("$.laboratory.data.totalElements").value(0));
        verify(query(Diagnosis.class)).setFirstResult(5); verify(query(LabRequest.class)).setFirstResult(10); verify(query(Treatment.class)).setFirstResult(15);
        verify(query(LabRequest.class)).setMaxResults(5); verify(query(Treatment.class)).setMaxResults(5);
        verify(query(LabRequest.class)).setParameter("case",id); verify(query(LabRequest.class)).setParameter("registration",r.getId()); verify(query(LabRequest.class)).setParameter("facilities",Set.of(facility));
        var hql=ArgumentCaptor.forClass(String.class); verify(em).createQuery(hql.capture(),eq(LabRequest.class));
        assertThat(hql.getValue()).contains("r.tbCase.id=:case or r.registration.id=:registration",LabAccess.READ_SCOPE,"order by r.requestedAt desc nulls last,r.id");
        verify(em).createQuery(hql.capture(),eq(Treatment.class)); assertThat(hql.getValue()).contains("t.tbCase.id=:id","t.facility.id in :facilities","t.facility.active=true","t.id desc");
    }
    @Test void treatmentChildPermissionsAreIndependentAndNoChildQueryRunsWhenDenied() throws Exception {
        Treatment t=new Treatment(); t.setId(UUID.randomUUID()); t.setFacility(c.getCurrentFacility()); t.setStartDate(LocalDate.of(2026,1,2)); t.setStatus("COMPLETED");
        when(query(Treatment.class).getResultList()).thenReturn(List.of(t));
        actor("TB_OFFICER",Set.of("CASE_READ","TREATMENT_READ"),Set.of(facility));
        mvc.perform(get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.treatments.data.content[0].status").value("COMPLETED"))
                .andExpect(jsonPath("$.treatments.data.content[0].doses.data").isEmpty()).andExpect(jsonPath("$.treatments.data.content[0].followUps.data").isEmpty())
                .andExpect(jsonPath("$.treatments.data.content[0].outcome.state").value("PERMISSION_DENIED"));
        verify(em,never()).createQuery(anyString(),eq(DoseEvent.class)); verify(em,never()).createQuery(anyString(),eq(FollowUp.class)); verify(em,never()).createQuery(anyString(),eq(TreatmentOutcome.class));
    }
    @ParameterizedTest @ValueSource(strings={"diagnosisPage=-1","labPage=2147483647","treatmentPage=-1","patientId=foreign","size=1000"})
    void invalidOrUnapprovedPagingIsRejected(String input) throws Exception {
        String[] parts=input.split("=",2); mvc.perform(get(path()).param(parts[0],parts[1])).andExpect(status().isBadRequest());
        verify(em,never()).createQuery(anyString(),eq(Long.class));
    }
    @ParameterizedTest @ValueSource(strings={"ACTIVE","COMPLETED"})
    void diagnosisConfirmationIsLinkedToThisRegistrationWithoutInferringItFromLabs(String status) throws Exception {
        c.setStatus(status);
        Diagnosis d=new Diagnosis(); d.setId(UUID.randomUUID()); d.setRegistration(r); d.setDiagnosisDate(LocalDate.of(2026,1,2)); d.setDiagnosisResult("Recorded diagnosis");
        c.setConfirmingDiagnosis(d); when(query(Diagnosis.class).getResultList()).thenReturn(List.of(d));
        actor("TB_OFFICER",Set.of("CASE_READ","DIAGNOSIS_READ"),Set.of(facility));
        mvc.perform(get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.diagnoses.data.content[0].confirming").value(true))
                .andExpect(jsonPath("$.registration.state").value("PERMISSION_DENIED"));
        verify(query(Diagnosis.class)).setParameter("id",r.getId()); verify(query(Diagnosis.class)).setMaxResults(5);
        verify(em,never()).createQuery(anyString(),eq(LabRequest.class));
    }
    @Test void reportedLabVersionsRetainLineageAndAreBoundedWithoutExposingNotes() throws Exception {
        LabRequest request=new LabRequest(); request.setId(UUID.randomUUID()); request.setTbCase(c); request.setStatus("COMPLETED"); request.setRequestingFacility(c.getCurrentFacility()); request.setTestingFacility(c.getCurrentFacility());
        LabRequestTest test=new LabRequestTest(); test.setId(UUID.randomUUID()); test.setLabRequest(request); test.setTestTypeCode("TCM");
        LabResult original=new LabResult(); original.setId(UUID.randomUUID()); original.setLabRequestTest(test); original.setSequenceNo(1); original.setStatus("FINAL"); original.setResultText("Original recorded value");
        LabResult corrected=new LabResult(); corrected.setId(UUID.randomUUID()); corrected.setLabRequestTest(test); corrected.setSequenceNo(2); corrected.setStatus("CORRECTED"); corrected.setResultText("Corrected recorded value");
        List<Object[]> rows=new ArrayList<>(); rows.add(new Object[]{corrected,2}); rows.add(new Object[]{original,2});
        for(int i=0;i<19;i++) rows.add(new Object[]{original,2});
        when(query(LabRequest.class).getResultList()).thenReturn(List.of(request)); when(query(Object[].class).getResultList()).thenReturn(rows);
        actor("TB_OFFICER",Set.of("CASE_READ","LAB_REQUEST_READ","LAB_RESULT_READ"),Set.of(facility));
        mvc.perform(get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.laboratory.data.content[0].results.content.length()").value(20))
                .andExpect(jsonPath("$.laboratory.data.content[0].results.hasMore").value(true))
                .andExpect(jsonPath("$.laboratory.data.content[0].results.content[0].latest").value(true))
                .andExpect(jsonPath("$.laboratory.data.content[0].results.content[1].latest").value(false))
                .andExpect(jsonPath("$.laboratory.data.content[0].results.content[0].testId").value(test.getId().toString()))
                .andExpect(jsonPath("$.laboratory.data.content[0].results.content[0].specimenId").isEmpty());
        verify(query(Object[].class)).setParameter("id",request.getId()); verify(query(Object[].class)).setMaxResults(21);
    }
    @Test void allowedTreatmentChildrenUseTheirEpisodeIdAndExactStoredValuesWithExplicitLimits() throws Exception {
        Treatment t=new Treatment(); t.setId(UUID.randomUUID()); t.setFacility(c.getCurrentFacility()); t.setStartDate(LocalDate.of(2026,1,2)); t.setStatus("ACTIVE");
        FollowUp f=new FollowUp(); f.setId(UUID.randomUUID()); f.setTreatment(t); f.setFollowUpType("Recorded check"); f.setScheduledAt(OffsetDateTime.parse("2026-01-03T00:00:00Z")); f.setStatus("SCHEDULED"); f.setNotes("PRIVATE-FOLLOW-NOTES");
        DoseEvent d=new DoseEvent(); d.setId(UUID.randomUUID()); d.setTreatment(t); d.setStatus("MISSED"); d.setScheduledDate(LocalDate.of(2026,1,2)); d.setRecordedAt(f.getScheduledAt()); d.setSource("PATIENT"); d.setNotes("PRIVATE-DOSE-NOTES");
        when(query(Treatment.class).getResultList()).thenReturn(List.of(t)); when(query(FollowUp.class).getResultList()).thenReturn(Collections.nCopies(11,f)); when(query(DoseEvent.class).getResultList()).thenReturn(Collections.nCopies(11,d));
        actor("TB_OFFICER",Set.of("CASE_READ","TREATMENT_READ","ADHERENCE_READ","FOLLOW_UP_READ","OUTCOME_READ"),Set.of(facility));
        var response=mvc.perform(get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.treatments.data.content[0].doses.data.content.length()").value(10))
                .andExpect(jsonPath("$.treatments.data.content[0].followUps.data.hasMore").value(true))
                .andExpect(jsonPath("$.treatments.data.content[0].outcome.state").value("AVAILABLE"))
                .andExpect(jsonPath("$.treatments.data.content[0].outcome.data").isEmpty()).andReturn();
        assertThat(response.getResponse().getContentAsString()).doesNotContain("PRIVATE-FOLLOW-NOTES","PRIVATE-DOSE-NOTES","recordedByUser","adherenceSummary");
        verify(query(FollowUp.class)).setParameter("id",t.getId()); verify(query(FollowUp.class)).setMaxResults(11);
        verify(query(DoseEvent.class)).setParameter("id",t.getId()); verify(query(DoseEvent.class)).setMaxResults(11);
        verify(query(TreatmentDrug.class)).setMaxResults(21); verify(query(TreatmentOutcome.class)).setMaxResults(1);
    }
    @Test void theSummaryEndpointHasNoMutationMapping() throws Exception {
        mvc.perform(post(path())).andExpect(status().isMethodNotAllowed()); verifyNoInteractions(em);
    }
    String path() { return "/api/v1/cases/"+id+"/summary"; }
}
