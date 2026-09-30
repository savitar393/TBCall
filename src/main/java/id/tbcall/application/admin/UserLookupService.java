package id.tbcall.application.admin;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import id.tbcall.persistence.entity.*;
import id.tbcall.security.IdentityNormalizer;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.admin.AdminDtos.*;

@Service
public class UserLookupService {
    private final EntityManager em;
    private final AdministrativePolicies policies;
    private final AuditService audit;
    public UserLookupService(EntityManager em, AdministrativePolicies policies, AuditService audit) {
        this.em=em; this.policies=policies; this.audit=audit;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public UserLookupResponse lookup(CurrentActor actor, String input) {
        policies.requireUserLookup(actor); String identity=IdentityNormalizer.login(input);
        var found=em.createQuery("select u from User u where u.email=:identity or u.phone=:identity",User.class)
                .setParameter("identity",identity).getResultList();
        if(found.isEmpty()) throw ApplicationFailure.missing(); User user=found.getFirst();
        boolean verified=identity.equals(user.getEmail()) ? user.getEmailVerifiedAt()!=null : user.getPhoneVerifiedAt()!=null;
        if(!verified) throw ApplicationFailure.missing();
        var roles=em.createQuery("select ur.role from UserRole ur where ur.userId=:user order by ur.role.code",Role.class)
                .setParameter("user",user.getId()).getResultList().stream().filter(r -> UserAdministrationService.ADMIN_MANAGED.contains(r.getCode()))
                .map(r -> new CurrentActor.RoleSummary(r.getCode(),r.getName())).toList();
        var assignments=em.createQuery("""
                select uf from UserFacility uf join fetch uf.facility f
                where uf.userId=:user and uf.active=true and f.active=true order by uf.facilityId
                """,UserFacility.class).setParameter("user",user.getId()).getResultList();
        boolean system=actor.hasRole("SYSTEM_ADMIN");
        var visible=assignments.stream().filter(uf -> system || actor.facilityIds().contains(uf.getFacilityId()))
                .map(uf -> new AdminFacilitySummary(uf.getFacilityId(),uf.getFacility().getName(),Boolean.TRUE.equals(uf.getIsPrimary()))).toList();
        boolean other=!system && assignments.stream().anyMatch(uf -> !actor.facilityIds().contains(uf.getFacilityId()));
        audit.record(actor.userId(),"ADMIN_USER_LOOKUP","USER",user.getId());
        return new UserLookupResponse(user.getId(),user.getVersion(),maskEmail(user.getEmail()),maskPhone(user.getPhone()),user.getStatus(),
                user.getEmailVerifiedAt()!=null,user.getPhoneVerifiedAt()!=null,roles,visible,other);
    }
    private String maskEmail(String value) { return value==null ? null : value.substring(0,1)+"***"+value.substring(value.indexOf('@')); }
    private String maskPhone(String value) { return value==null ? null : "***"+value.substring(Math.max(0,value.length()-4)); }
}
