package id.tbcall.application.reporting;

import id.tbcall.application.common.*;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.web.IfMatch;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.reporting.ReportingDtos.*;

@Service
public class ReportingPublicationService {
    private final ReportingAccess access; private final ReportingCatalogue catalogue; private final ReportingStore store;
    private final AuditService audit; private final Clock clock;
    public ReportingPublicationService(ReportingAccess access,ReportingCatalogue catalogue,ReportingStore store,AuditService audit,Clock clock) {
        this.access=access; this.catalogue=catalogue; this.store=store; this.audit=audit; this.clock=clock;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Candidate capture(CurrentActor actor) {
        access.admin(actor,"REPORT_PUBLISH");
        // Serialize capture and publication; acquire time only after the guard wait.
        // Clinical counts and private contributions share one fresh SQL statement snapshot.
        long sequence=store.lockPublications(); catalogue.requireVerified();
        Candidate candidate=store.capture(actor.userId(),sequence+1).candidate();
        audit.record(actor.userId(),"REPORT_SNAPSHOT_CAPTURED","REPORTING_SNAPSHOT",candidate.id());
        return candidate;
    }
    @Transactional
    public Candidate read(CurrentActor actor,UUID id) { access.admin(actor,"REPORT_PUBLISH"); return store.candidate(id,false); }
    // READ_COMMITTED is deliberate: AFTER the global lock waits, see all committed prior publications.
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Candidate publish(CurrentActor actor,UUID id,String match) {
        access.admin(actor,"REPORT_PUBLISH");
        long sequence=store.lockPublications(); catalogue.requireVerified();
        Candidate candidate=store.candidate(id,true); IfMatch.require(match,candidate.version());
        if(!candidate.state().equals("DRAFT") || !candidate.catalogueVersion().equals(ReportingCatalogue.VERSION)) throw ApplicationFailure.optimistic();
        // Durable database capture order, independent of application/OS clock skew.
        if(!store.newerThanPublished(id) || !ReleasePrivacy.safe(store.contributions(id),store.priorContributions())) {
            audit.reportingDenied(actor.userId(),"REPORT_PUBLICATION_WITHHELD",id);
            throw new ApplicationFailure(409,"REPORT_PUBLICATION_WITHHELD","Publikasi ditahan","Pemeriksaan pengungkapan seluruh rilis tidak dapat dipenuhi.");
        }
        store.publish(candidate,actor.userId(),OffsetDateTime.now(clock),sequence+1);
        audit.record(actor.userId(),"REPORT_SNAPSHOT_PUBLISHED","REPORTING_SNAPSHOT",id);
        return store.candidate(id,false);
    }
}
