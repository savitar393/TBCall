package id.tbcall.application.reminder;

import id.tbcall.application.common.*;
import id.tbcall.authorization.*;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class ChannelTestAdmission {
    private final AdministrativePolicies policies;private final ChannelProviderSafety safety;private final AuditService audit;
    public ChannelTestAdmission(AdministrativePolicies policies,ChannelProviderSafety safety,AuditService audit){this.policies=policies;this.safety=safety;this.audit=audit;}
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void request(CurrentActor actor,UUID job,boolean confirmed){
        policies.requireSystem(actor,"USER_ACCOUNT_MANAGE");safety.requireTest();
        if(!confirmed)throw ApplicationFailure.invalid("Konfirmasi operasi uji diperlukan.");
        audit.record(actor.userId(),job==null?"REMINDER_CHANNEL_TEST_OPERATION":"REMINDER_CHANNEL_TEST_REQUESTED",job==null?"USER":"REMINDER_JOB",job==null?actor.userId():job);
    }
}
