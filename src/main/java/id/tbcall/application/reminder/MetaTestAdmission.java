package id.tbcall.application.reminder;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Authorizes and durably audits a single explicit operator request before any handoff. */
@Service
public class MetaTestAdmission {
    private final AdministrativePolicies policies;
    private final MetaReminderSafety safety;
    private final AuditService audit;
    public MetaTestAdmission(AdministrativePolicies policies,MetaReminderSafety safety,AuditService audit){this.policies=policies;this.safety=safety;this.audit=audit;}
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void request(CurrentActor actor,UUID job,boolean confirmed){
        policies.requireSystem(actor,"USER_ACCOUNT_MANAGE");safety.requireTest();
        if(!confirmed)throw ApplicationFailure.invalid("Konfirmasi operasi uji diperlukan.");
        audit.record(actor.userId(),job==null?"MEDICATION_REMINDER_TEST_PLANNING_REQUESTED":"MEDICATION_REMINDER_TEST_REQUESTED",
                job==null?"USER":"REMINDER_JOB",job==null?actor.userId():job);
    }
}
