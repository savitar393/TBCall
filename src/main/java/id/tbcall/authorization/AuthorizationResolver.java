package id.tbcall.authorization;

import id.tbcall.persistence.entity.*;
import jakarta.persistence.EntityManager;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.authorization.CurrentActor.*;

@Service
public class AuthorizationResolver {
    private final EntityManager em;
    public AuthorizationResolver(EntityManager em) { this.em = em; }
    @Transactional(readOnly=true)
    public CurrentActor resolve(User user, UUID sessionId) {
        List<Role> roles = em.createQuery("select ur.role from UserRole ur where ur.userId=:user order by ur.role.code", Role.class)
                .setParameter("user", user.getId()).getResultList();
        Set<String> permissions = new LinkedHashSet<>(em.createQuery("""
                select distinct rp.permission.code from RolePermission rp
                where rp.roleId in (select ur.roleId from UserRole ur where ur.userId=:user)
                order by rp.permission.code
                """, String.class).setParameter("user", user.getId()).getResultList());
        List<Facility> facilities = em.createQuery("""
                select uf.facility from UserFacility uf where uf.userId=:user and uf.active=true
                and uf.facility.active=true order by uf.facility.id
                """, Facility.class).setParameter("user", user.getId()).getResultList();
        List<PatientUserLink> links = em.createQuery("""
                select l from PatientUserLink l where l.user.id=:user
                and l.relationshipType='SELF' and l.verificationStatus='VERIFIED'
                """, PatientUserLink.class).setParameter("user", user.getId()).getResultList();
        PatientLinkSummary link = links.isEmpty() ? null : new PatientLinkSummary(links.getFirst().getId(),
                links.getFirst().getPatient().getId(), links.getFirst().getVersion());
        Set<UUID> supporterCases = new LinkedHashSet<>(em.createQuery("""
                select distinct s.tbCase.id from PatientSupporter s where s.linkedUser.id=:user and s.active=true
                order by s.tbCase.id
                """, UUID.class).setParameter("user", user.getId()).getResultList());
        List<RoleSummary> summaries = roles.stream().map(r -> new RoleSummary(r.getCode(), r.getName())).toList();
        MeResponse me = new MeResponse(user.getId(), user.getEmail(), user.getPhone(), user.getStatus(), summaries,
                Set.copyOf(permissions), facilities.stream().map(f -> new FacilitySummary(f.getId(), f.getName())).toList(),
                link, Set.copyOf(supporterCases));
        return new CurrentActor(user.getId(), sessionId, me, roles.stream().map(Role::getCode).collect(java.util.stream.Collectors.toSet()),
                Set.copyOf(permissions), facilities.stream().map(Facility::getId).collect(java.util.stream.Collectors.toSet()),
                link == null ? null : link.patientId(), Set.copyOf(supporterCases));
    }
}
