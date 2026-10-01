package id.tbcall.application.clinical;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.clinical.ClinicalDtos.*;

@Service
@Transactional(readOnly=true,isolation=Isolation.READ_COMMITTED)
public class ClinicalQueryService {
    private final EntityManager em;
    private final ClinicalAccess access;
    private final ClinicalViews views;
    public ClinicalQueryService(EntityManager em,ClinicalAccess access,ClinicalViews views) { this.em=em; this.access=access; this.views=views; }
    public RegistrationView registration(CurrentActor actor,UUID id) { return views.registration(access.registration(actor,"REGISTRATION_READ",id,false)); }
    public CaseView tbCase(CurrentActor actor,UUID id) { return views.tbCase(access.tbCase(actor,"CASE_READ",id)); }
    public PatientDetail patient(CurrentActor actor,UUID id) {
        Patient p=access.patient(actor,"PATIENT_READ",id); return detail(actor,p);
    }
    public PatientDetail detail(CurrentActor actor,Patient p) {
        var labels=views.labels(); var ids=List.of(p.getId());
        return new PatientDetail(p.getId(),p.getVersion(),views.demographics(p,labels),
                registrations(ids,actor.facilityIds()).stream().map(r -> views.registration(r,labels)).toList(),
                cases(ids,actor.facilityIds()).stream().map(c -> new PatientCaseSummary(views.caseSummary(c,labels),c.getHivStatusCode(),c.getDmStatusCode())).toList());
    }
    public PatientPage patients(CurrentActor actor,PatientFilters filter) {
        access.officer(actor,"PATIENT_READ");
        if(filter.page()<0 || filter.size()<1 || filter.size()>50 || (long)filter.page()*filter.size()>Integer.MAX_VALUE)
            throw ApplicationFailure.invalid("Halaman harus non-negatif dan ukuran halaman 1–50.");
        String name=ClinicalValidation.text(filter.name()),nik=ClinicalValidation.text(filter.nik()),bpjs=ClinicalValidation.text(filter.bpjs());
        if(name!=null && (name.length()<3 || name.length()>255)) throw ApplicationFailure.invalid("Pencarian nama harus berisi 3–255 karakter.");
        if(nik!=null && !nik.matches("[0-9]{16}")) throw ApplicationFailure.invalid("Filter NIK harus tepat 16 digit.");
        if(bpjs!=null && bpjs.length()>50) throw ApplicationFailure.invalid("Nomor BPJS terlalu panjang.");
        if(filter.registrationStatus()!=null && !Set.of("OPEN","DIAGNOSED","CONVERTED_TO_CASE","CLOSED","CANCELLED").contains(filter.registrationStatus())) throw ApplicationFailure.invalid("Status registrasi tidak dikenal.");
        if(filter.caseStatus()!=null && !Set.of("ACTIVE","REFERRED","TRANSFERRED","COMPLETED","CLOSED","CANCELLED").contains(filter.caseStatus())) throw ApplicationFailure.invalid("Status kasus tidak dikenal.");
        Set<UUID> facilities=actor.facilityIds();
        if(filter.facilityId()!=null) {
            if(!facilities.contains(filter.facilityId())) throw ApplicationFailure.missing(); facilities=Set.of(filter.facilityId());
        }
        String where=" where "+ClinicalAccess.CURRENT_PATIENT; Map<String,Object> parameters=new LinkedHashMap<>(); parameters.put("facilities",facilities);
        if(name!=null) { where+=" and lower(p.fullName) like :name escape '!'"; parameters.put("name","%"+name.toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%"); }
        if(nik!=null) { where+=" and p.nik=:nik"; parameters.put("nik",nik); }
        if(bpjs!=null) { where+=" and p.bpjsNumber=:bpjs"; parameters.put("bpjs",bpjs); }
        if(filter.registrationStatus()!=null) {
            where+=" and exists (select r.id from TBRegistration r where r.patient.id=p.id and r.facility.id in :facilities and r.facility.active=true and r.status in ('OPEN','DIAGNOSED') and r.status=:registrationStatus)";
            parameters.put("registrationStatus",filter.registrationStatus());
        }
        if(filter.caseStatus()!=null) {
            where+=" and exists (select c.id from TBCase c where c.registration.patient.id=p.id and c.currentFacility.id in :facilities and c.currentFacility.active=true and c.status in ('ACTIVE','REFERRED') and c.status=:caseStatus)";
            parameters.put("caseStatus",filter.caseStatus());
        }
        var count=em.createQuery("select count(p) from Patient p"+where,Long.class);
        var query=em.createQuery("select p from Patient p"+where+" order by p.fullName,p.id",Patient.class);
        parameters.forEach((key,value) -> { count.setParameter(key,value); query.setParameter(key,value); });
        long total=count.getSingleResult(); var patients=query.setFirstResult(filter.page()*filter.size()).setMaxResults(filter.size()).getResultList();
        if(patients.isEmpty()) return new PatientPage(List.of(),filter.page(),filter.size(),total);
        var labels=views.labels(); var ids=patients.stream().map(Patient::getId).toList();
        Map<UUID,List<RegistrationSummary>> registrations=new HashMap<>();
        for(var r:registrations(ids,facilities)) registrations.computeIfAbsent(r.getPatient().getId(),key -> new ArrayList<>()).add(views.registrationSummary(r));
        Map<UUID,List<CaseListSummary>> cases=new HashMap<>();
        for(var c:cases(ids,facilities)) cases.computeIfAbsent(c.getRegistration().getPatient().getId(),key -> new ArrayList<>()).add(views.caseListSummary(c,labels));
        var content=patients.stream().map(p -> new PatientListItem(p.getId(),p.getVersion(),p.getFullName(),views.patient(p,labels).sex(),p.getBirthDate(),Boolean.TRUE.equals(p.getBirthDateUnknown()),
                ClinicalViews.mask(p.getNik()),ClinicalViews.mask(p.getBpjsNumber()),registrations.getOrDefault(p.getId(),List.of()),cases.getOrDefault(p.getId(),List.of()))).toList();
        return new PatientPage(content,filter.page(),filter.size(),total);
    }
    public SelfPatient self(CurrentActor actor) {
        if(!actor.hasRole("PATIENT") || !actor.permissions().contains("PATIENT_READ") || actor.selfPatientId()==null) throw ApplicationFailure.forbidden();
        Patient p=em.find(Patient.class,actor.selfPatientId()); if(p==null) throw ApplicationFailure.missing();
        var labels=views.labels();
        // SELF can view their own current episodes across facilities; it never grants staff endpoints.
        var registrations=em.createQuery("select r from TBRegistration r join fetch r.facility where r.patient.id=:patient and r.status in ('OPEN','DIAGNOSED') order by r.registrationDate,r.id",TBRegistration.class)
                .setParameter("patient",p.getId()).getResultList();
        var cases=em.createQuery("select c from TBCase c join fetch c.currentFacility join fetch c.registration left join fetch c.confirmingDiagnosis where c.registration.patient.id=:patient and c.status in ('ACTIVE','REFERRED') order by c.id",TBCase.class)
                .setParameter("patient",p.getId()).getResultList();
        return new SelfPatient(p.getId(),p.getFullName(),views.patient(p,labels).sex(),p.getBirthPlace(),p.getBirthDate(),Boolean.TRUE.equals(p.getBirthDateUnknown()),p.getPhone(),p.getAddress(),
                registrations.stream().map(views::registrationSummary).toList(),cases.stream().map(c -> views.caseSummary(c,labels)).toList());
    }
    private List<TBRegistration> registrations(List<UUID> patients,Set<UUID> facilities) {
        return em.createQuery("select r from TBRegistration r join fetch r.facility join fetch r.patient where r.patient.id in :patients and r.facility.id in :facilities and r.facility.active=true and r.status in ('OPEN','DIAGNOSED') order by r.registrationDate,r.id",TBRegistration.class)
                .setParameter("patients",patients).setParameter("facilities",facilities).getResultList();
    }
    private List<TBCase> cases(List<UUID> patients,Set<UUID> facilities) {
        return em.createQuery("select c from TBCase c join fetch c.currentFacility join fetch c.registration r join fetch r.patient left join fetch c.confirmingDiagnosis where r.patient.id in :patients and c.currentFacility.id in :facilities and c.currentFacility.active=true and c.status in ('ACTIVE','REFERRED') order by c.id",TBCase.class)
                .setParameter("patients",patients).setParameter("facilities",facilities).getResultList();
    }
}
