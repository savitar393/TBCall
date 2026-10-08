package id.tbcall.application.admin;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.admin.AdminDtos.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
public class FacilityAdministrationService {
    private final EntityManager em;
    private final AdministrativePolicies policies;
    private final AuditService audit;
    public FacilityAdministrationService(EntityManager em, AdministrativePolicies policies, AuditService audit) {
        this.em=em; this.policies=policies; this.audit=audit;
    }
    @Transactional(readOnly=true)
    public FacilityResponse detail(CurrentActor actor, UUID id) {
        policies.requireSystem(actor,"FACILITY_MANAGE");
        Facility facility=em.find(Facility.class,id);
        if(facility==null) throw ApplicationFailure.missing();
        return response(facility);
    }
    public FacilityResponse create(CurrentActor actor, FacilityInput input) {
        policies.requireSystem(actor,"FACILITY_MANAGE");
        if(input.getName()==null || input.getName().isBlank()) throw ApplicationFailure.invalid("Nama fasyankes wajib diisi.");
        Facility facility=new Facility(); apply(facility,input); em.persist(facility);
        audit.record(actor.userId(),"FACILITY_CREATED","FACILITY",facility.getId()); em.flush();
        return response(facility);
    }
    public FacilityResponse update(CurrentActor actor, UUID id, FacilityInput input, String match) {
        policies.requireSystem(actor,"FACILITY_MANAGE"); Facility facility=em.find(Facility.class,id);
        if(facility==null) throw ApplicationFailure.missing(); IfMatch.require(match,facility.getVersion());
        apply(facility,input); audit.record(actor.userId(),"FACILITY_UPDATED","FACILITY",id); em.flush(); return response(facility);
    }
    public FacilityResponse deactivate(CurrentActor actor, UUID id, String match) {
        policies.requireSystem(actor,"FACILITY_MANAGE");
        // Assignment commands take the same facility lock before checking/creating active memberships.
        Facility facility=em.find(Facility.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(facility==null) throw ApplicationFailure.missing(); IfMatch.require(match,facility.getVersion());
        long memberships=em.createQuery("select count(uf) from UserFacility uf where uf.facilityId=:facility and uf.active=true",Long.class)
                .setParameter("facility",id).getSingleResult();
        if(memberships>0) throw ApplicationFailure.conflict("Fasyankes masih memiliki penugasan pengguna aktif.");
        facility.setActive(false); audit.record(actor.userId(),"FACILITY_DEACTIVATED","FACILITY",id); em.flush(); return response(facility);
    }
    private void apply(Facility facility, FacilityInput input) {
        for(var field:input.getChangedFields()) switch(field) {
            case NAME -> {
                if(input.getName()==null || input.getName().isBlank()) throw ApplicationFailure.invalid("Nama fasyankes wajib diisi.");
                facility.setName(input.getName().strip());
            }
            case TYPE -> {
                String code=input.getFacilityTypeCode();
                if(code!=null && em.createQuery("select count(t) from FacilityType t where t.code=:code",Long.class).setParameter("code",code).getSingleResult()==0)
                    throw ApplicationFailure.invalid("Jenis fasyankes tidak dikenal.");
                facility.setFacilityTypeCode(code);
            }
            case PARENT -> {
                UUID parent=input.getParentFacilityId();
                if(parent!=null && parent.equals(facility.getId())) throw ApplicationFailure.invalid("Fasyankes tidak dapat menjadi induknya sendiri.");
                Facility parentFacility=parent==null ? null : em.find(Facility.class,parent);
                if(parent!=null && parentFacility==null) throw ApplicationFailure.invalid("Fasyankes induk tidak ditemukan.");
                facility.setParentFacility(parentFacility);
            }
            case ADDRESS -> facility.setAddress(input.getAddress());
            case PROVINCE -> facility.setProvinceCode(input.getProvinceCode());
            case REGENCY -> facility.setRegencyCode(input.getRegencyCode());
            case DISTRICT -> facility.setDistrictCode(input.getDistrictCode());
            case VILLAGE -> facility.setVillageCode(input.getVillageCode());
            case POSTAL -> facility.setPostalCode(input.getPostalCode());
            case LATITUDE -> facility.setLatitude(input.getLatitude());
            case LONGITUDE -> facility.setLongitude(input.getLongitude());
        }
    }
    private FacilityResponse response(Facility f) {
        return new FacilityResponse(f.getId(),f.getVersion(),f.getName(),f.getFacilityTypeCode(),
                f.getParentFacility()==null ? null : f.getParentFacility().getId(),f.getAddress(),f.getProvinceCode(),f.getRegencyCode(),
                f.getDistrictCode(),f.getVillageCode(),f.getPostalCode(),f.getLatitude(),f.getLongitude(),Boolean.TRUE.equals(f.getActive()));
    }
}
