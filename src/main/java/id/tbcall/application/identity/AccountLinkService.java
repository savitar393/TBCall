package id.tbcall.application.identity;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.authorization.ScopePolicies;
import id.tbcall.persistence.entity.*;
import id.tbcall.web.IfMatch;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.identity.LinkDtos.*;

@Service
@Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
public class AccountLinkService {
    private final EntityManager em;
    private final ScopePolicies scopes;
    private final RoleAssignments roles;
    private final AuditService audit;
    private final Clock clock;
    private final OnboardingAccess onboarding;
    public AccountLinkService(EntityManager em, ScopePolicies scopes, RoleAssignments roles, AuditService audit, Clock clock, OnboardingAccess onboarding) {
        this.em=em; this.scopes=scopes; this.roles=roles; this.audit=audit; this.clock=clock;this.onboarding=onboarding;
    }
    public PatientLinkResult verifyPatient(CurrentActor actor, UUID patientId, UUID userId, String match) {
        scopes.requireOfficerPatientLinkScope(actor, "PATIENT_LINK_VERIFY", patientId);
        Patient patient=em.find(Patient.class, patientId, LockModeType.PESSIMISTIC_WRITE);
        if (patient==null) throw ApplicationFailure.missing();
        User user=target(userId);
        long verified=em.createQuery("""
                select count(l) from PatientUserLink l where l.relationshipType='SELF' and l.verificationStatus='VERIFIED'
                and (l.patient.id=:patient or l.user.id=:user)
                """, Long.class).setParameter("patient", patientId).setParameter("user", userId).getSingleResult();
        if (verified>0) throw ApplicationFailure.conflict("Tautan SELF terverifikasi sudah ada. Cabut tautan lama sebelum menautkan kembali.");
        List<PatientUserLink> found=em.createQuery("""
                select l from PatientUserLink l where l.patient.id=:patient and l.user.id=:user and l.relationshipType='SELF'
                """, PatientUserLink.class).setParameter("patient", patientId).setParameter("user", userId).getResultList();
        boolean created=found.isEmpty(); PatientUserLink link=created ? new PatientUserLink() : found.getFirst();
        if (!created) IfMatch.require(match, link.getVersion());
        if (!created && !List.of("PENDING", "REVOKED").contains(link.getVerificationStatus()))
            throw ApplicationFailure.conflict("Status tautan tidak mengizinkan verifikasi.");
        link.setPatient(patient); link.setUser(user); link.setRelationshipType("SELF"); link.setVerificationStatus("VERIFIED");
        link.setVerifiedBy(em.getReference(User.class, actor.userId())); link.setVerifiedAt(OffsetDateTime.now(clock));
        if (created) em.persist(link);
        roles.assign(user, "PATIENT", actor.userId()); audit.record(actor.userId(), "PATIENT_LINK_VERIFIED", "PATIENT_USER_LINK", link.getId());
        em.flush(); return new PatientLinkResult(patientResponse(link), created);
    }
    public PatientLinkResponse revokePatient(CurrentActor actor, UUID patientId, UUID expectedLinkId, String match) {
        scopes.requireOfficerPatientLinkScope(actor, "PATIENT_LINK_VERIFY", patientId);
        em.find(Patient.class, patientId, LockModeType.PESSIMISTIC_WRITE);
        List<PatientUserLink> found=em.createQuery("""
                select l from PatientUserLink l where l.patient.id=:patient and l.relationshipType='SELF' and l.verificationStatus='VERIFIED'
                """, PatientUserLink.class).setParameter("patient", patientId).getResultList();
        if (found.isEmpty() || !found.getFirst().getId().equals(expectedLinkId)) throw ApplicationFailure.optimistic();
        PatientUserLink link=found.getFirst(); IfMatch.require(match, link.getVersion());
        User user=em.find(User.class, link.getUser().getId(), LockModeType.PESSIMISTIC_WRITE);
        link.setVerificationStatus("REVOKED"); roles.remove(user, "PATIENT", actor.userId());
        audit.record(actor.userId(), "PATIENT_LINK_REVOKED", "PATIENT_USER_LINK", link.getId());
        em.flush(); return patientResponse(link);
    }
    public SupporterLinkResponse linkSupporter(CurrentActor actor, UUID caseId, UUID supporterId, UUID userId, String match) {
        PatientSupporter supporter=supporter(actor, caseId, supporterId, match, true);
        UUID previous=supporter.getLinkedUser()==null ? null : supporter.getLinkedUser().getId();
        lockUsers(previous, userId); User user=target(userId);
        supporter.setLinkedUser(user); roles.assign(user, "TREATMENT_SUPPORTER", actor.userId());
        if (previous!=null && !previous.equals(userId)) removeUnsupportedRole(previous, actor.userId());
        audit.record(actor.userId(), "SUPPORTER_LINKED", "PATIENT_SUPPORTER", supporter.getId());
        em.flush(); return supporterResponse(supporter);
    }
    public SupporterLinkResponse unlinkSupporter(CurrentActor actor, UUID caseId, UUID supporterId, String match) {
        PatientSupporter supporter=supporter(actor, caseId, supporterId, match, false);
        if (supporter.getLinkedUser()==null) throw ApplicationFailure.conflict("Pendamping belum memiliki tautan akun.");
        UUID previous=supporter.getLinkedUser().getId(); lockUsers(previous, null);
        supporter.setLinkedUser(null); removeUnsupportedRole(previous, actor.userId());
        audit.record(actor.userId(), "SUPPORTER_UNLINKED", "PATIENT_SUPPORTER", supporter.getId());
        em.flush(); return supporterResponse(supporter);
    }
    private PatientSupporter supporter(CurrentActor actor, UUID caseId, UUID supporterId, String match, boolean prospective) {
        onboarding.tbCase(actor,caseId,true,prospective);
        PatientSupporter supporter=onboarding.supporter(caseId,supporterId,false);
        IfMatch.require(match, supporter.getVersion());
        if (!Boolean.TRUE.equals(supporter.getActive())) throw ApplicationFailure.conflict("Pendamping tidak aktif.");
        return supporter;
    }
    private User target(UUID id) {
        User user=em.find(User.class, id, LockModeType.PESSIMISTIC_WRITE);
        if (user==null || !"ACTIVE".equals(user.getStatus()) || !((user.getEmail()!=null && user.getEmailVerifiedAt()!=null)
                || (user.getPhone()!=null && user.getPhoneVerifiedAt()!=null)))
            throw ApplicationFailure.invalid("Pengguna tujuan harus aktif dan memiliki identitas login terverifikasi.");
        return user;
    }
    private void lockUsers(UUID one, UUID two) {
        List<UUID> ids=new ArrayList<>(); if (one!=null) ids.add(one); if (two!=null && !two.equals(one)) ids.add(two);
        ids.sort(UUID::compareTo); for (UUID id:ids) em.find(User.class, id, LockModeType.PESSIMISTIC_WRITE);
    }
    private void removeUnsupportedRole(UUID user, UUID actor) {
        // AUTO flush makes the changed link visible to this query within the transaction.
        long remaining=em.createQuery("select count(s) from PatientSupporter s where s.linkedUser.id=:user and s.active=true", Long.class)
                .setParameter("user", user).getSingleResult();
        if (remaining==0) roles.remove(em.getReference(User.class, user), "TREATMENT_SUPPORTER", actor);
    }
    private PatientLinkResponse patientResponse(PatientUserLink link) {
        return new PatientLinkResponse(link.getId(), link.getPatient().getId(), link.getUser().getId(),
                link.getRelationshipType(), link.getVerificationStatus(), link.getVersion());
    }
    private SupporterLinkResponse supporterResponse(PatientSupporter supporter) {
        return new SupporterLinkResponse(supporter.getId(), supporter.getTbCase().getId(),
                supporter.getLinkedUser()==null ? null : supporter.getLinkedUser().getId(), supporter.getVersion());
    }
}
