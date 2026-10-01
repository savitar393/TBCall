package id.tbcall.application.laboratory;

import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.laboratory.LabDtos.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class LabViews {
    private final EntityManager em;
    public LabViews(EntityManager em) { this.em=em; }
    private Owner owner(LabRequest r) { return r.getRegistration()!=null ? new Owner("REGISTRATION",r.getRegistration().getId()) : new Owner("CASE",r.getTbCase().getId()); }
    private PatientDisplay patient(LabRequest r) {
        Patient p=(r.getRegistration()!=null ? r.getRegistration() : r.getTbCase().getRegistration()).getPatient();
        SexCode sex=p.getSexCode()==null ? null : em.find(SexCode.class,p.getSexCode());
        return new PatientDisplay(p.getId(),p.getFullName(),sex==null ? null : new Label(sex.getCode(),sex.getName()),p.getBirthDate(),Boolean.TRUE.equals(p.getBirthDateUnknown()));
    }
    private FacilityDisplay facility(Facility f) { return new FacilityDisplay(f.getId(),f.getName()); }
    private Label reason(LabRequest r) { LabRequestReason reason=em.find(LabRequestReason.class,r.getRequestReasonCode()); return new Label(reason.getCode(),reason.getName()); }
    private Label type(LabRequestTest t) { LabTestType type=em.find(LabTestType.class,t.getTestTypeCode()); return new Label(type.getCode(),type.getName()); }
    private List<LabRequestTest> tests(Collection<UUID> ids) {
        return em.createQuery("select t from LabRequestTest t where t.labRequest.id in :ids order by t.createdAt,t.id",LabRequestTest.class).setParameter("ids",ids).getResultList();
    }
    private List<LabSpecimen> specimens(Collection<UUID> ids) {
        return em.createQuery("select s from LabSpecimen s where s.labRequest.id in :ids order by s.createdAt,s.id",LabSpecimen.class).setParameter("ids",ids).getResultList();
    }
    private Completeness completeness(List<LabRequestTest> tests,List<LabSpecimen> specimens) {
        int required=(int)tests.stream().filter(t -> !"CANCELLED".equals(t.getStatus())).count();
        int complete=(int)tests.stream().filter(t -> "RESULT_AVAILABLE".equals(t.getStatus())).count();
        int received=(int)specimens.stream().filter(s -> s.getReceivedAt()!=null).count();
        int usable=(int)specimens.stream().filter(s -> s.getReceivedAt()!=null && Boolean.TRUE.equals(s.getExaminationPossible())).count();
        return new Completeness(required,complete,specimens.size(),received,usable,usable==0);
    }
    public List<RequestSummary> summaries(List<LabRequest> requests) {
        if(requests.isEmpty()) return List.of();
        var ids=requests.stream().map(LabRequest::getId).toList();
        var tests=tests(ids).stream().collect(Collectors.groupingBy(t -> t.getLabRequest().getId()));
        var specimens=specimens(ids).stream().collect(Collectors.groupingBy(s -> s.getLabRequest().getId()));
        return requests.stream().map(r -> {
            var ts=tests.getOrDefault(r.getId(),List.of()); var ss=specimens.getOrDefault(r.getId(),List.of());
            return new RequestSummary(r.getId(),r.getVersion(),owner(r),patient(r),facility(r.getRequestingFacility()),facility(r.getTestingFacility()),reason(r),r.getReferralType(),r.getRequestedAt(),r.getStatus(),
                    ts.stream().map(t -> new TestSummary(t.getId(),t.getVersion(),type(t),t.getStatus())).toList(),completeness(ts,ss));
        }).toList();
    }
    public RequestDetail detail(CurrentActor actor,LabRequest r) {
        var tests=tests(List.of(r.getId())); var specimens=specimens(List.of(r.getId()));
        Map<UUID,List<LabResult>> latest=Map.of();
        if(actor.permissions().contains("LAB_RESULT_READ")) {
            latest=em.createQuery("""
                    select v from LabResult v left join fetch v.specimen
                    where v.labRequestTest.labRequest.id=:id and v.status in ('FINAL','CORRECTED')
                    and v.sequenceNo=(select max(n.sequenceNo) from LabResult n where n.labRequestTest=v.labRequestTest
                        and ((n.specimen is null and v.specimen is null) or n.specimen=v.specimen))
                    order by v.sequenceNo,v.id
                    """,LabResult.class).setParameter("id",r.getId()).getResultList().stream().collect(Collectors.groupingBy(v -> v.getLabRequestTest().getId()));
        }
        Map<UUID,List<LabResult>> results=latest;
        return new RequestDetail(r.getId(),r.getVersion(),owner(r),patient(r),facility(r.getRequestingFacility()),facility(r.getTestingFacility()),reason(r),r.getReferralType(),r.getRequestedAt(),r.getStatus(),r.getSampleShippingMethod(),r.getCourierName(),r.getNotes(),
                tests.stream().map(t -> new TestDetail(t.getId(),t.getVersion(),type(t),t.getStatus(),results.getOrDefault(t.getId(),List.of()).stream().map(this::resultView).toList())).toList(),
                specimens.stream().map(this::specimen).toList(),completeness(tests,specimens));
    }
    public SpecimenView specimen(LabSpecimen s) {
        var r=s.getLabRequest();
        return new SpecimenView(s.getId(),s.getVersion(),r.getId(),r.getVersion(),s.getSpecimenCode(),s.getSpecimenType(),s.getCollectedAt(),s.getSentAt(),s.getReceivedAt(),s.getConditionOnReceipt(),s.getExaminationPossible(),s.getRejectionReason(),s.getNotes());
    }
    private ResultView resultView(LabResult v) {
        return new ResultView(v.getId(),v.getVersion(),v.getLabRequestTest().getId(),v.getSpecimen()==null ? null : v.getSpecimen().getId(),v.getSequenceNo(),v.getStatus(),v.getTestedAt(),v.getResultCode(),v.getResultValue(),v.getResultText());
    }
    public ResultResponse result(LabResult v) {
        var t=v.getLabRequestTest(); var r=t.getLabRequest();
        return new ResultResponse(v.getId(),v.getVersion(),r.getId(),r.getVersion(),t.getId(),t.getVersion(),v.getSpecimen()==null ? null : v.getSpecimen().getId(),v.getSequenceNo(),v.getStatus(),v.getTestedAt(),v.getResultCode(),v.getResultValue(),v.getResultText());
    }
}
