package id.tbcall.application.identity;

import id.tbcall.authorization.CurrentActor;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.identity.OnboardingDtos.*;

@Service
@Transactional(propagation=Propagation.NOT_SUPPORTED)
public class AccountResolutionService {
    private final AccountResolutionTransaction transaction;
    public AccountResolutionService(AccountResolutionTransaction transaction) { this.transaction=transaction; }
    public Candidate patient(CurrentActor actor,UUID patientId,String identity) {
        return result(transaction.resolve(actor,patientId,null,null,identity));
    }
    public Candidate supporter(CurrentActor actor,UUID caseId,UUID supporterId,String identity) {
        return result(transaction.resolve(actor,null,caseId,supporterId,identity));
    }
    private Candidate result(AccountResolutionTransaction.Outcome outcome) {
        // Throw only after the proxied REQUIRES_NEW invocation commits, including 404/429/invalid identities.
        if(outcome.failure()!=null)throw outcome.failure();return outcome.candidate();
    }
}
