package id.tbcall.application.reporting;

import id.tbcall.authorization.CurrentActor;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static id.tbcall.application.reporting.ReportingDtos.*;

@Service @Transactional
public class ProgramReportService {
    private final ReportingAccess access; private final ReportingStore store;
    public ProgramReportService(ReportingAccess access,ReportingStore store) { this.access=access; this.store=store; }
    public Summary summary(CurrentActor actor,String scope,String code) {
        Geography geography=access.readScope(actor,scope,code); Candidate latest=store.latest();
        return new Summary(latest.id(),latest.dataAsOf(),"AVAILABLE",store.summary(latest.id(),geography));
    }
    public Breakdown breakdown(CurrentActor actor,String scope,String code) {
        Geography geography=access.readScope(actor,scope,code); Candidate latest=store.latest();
        return new Breakdown(latest.id(),latest.dataAsOf(),geography.scope().equals("REGENCY")?"LEAF_SCOPE":"AVAILABLE",geography,store.children(latest.id(),geography));
    }
    public Metadata metadata(CurrentActor actor,String scope,String code) {
        Geography geography=access.readScope(actor,scope,code); Candidate latest=store.latest();
        Long unattributed=geography.scope().equals("NATIONAL")?store.unattributed(latest.id()):null;
        return new Metadata(latest.id(),latest.dataAsOf(),"TBCALL_HELD_RECORDS_NOT_OFFICIAL_SURVEILLANCE","APPROVED_CURRENT_STATE_SNAPSHOT",
                ReportingCatalogue.VERSION,"KEMENDAGRI",LocalDate.of(2025,6,23),LocalDate.of(2026,10,13),store.sources(),geography,
                ReleasePrivacy.MINIMUM_PATIENTS,"WHOLE_RELEASE_CONTRIBUTION_TRAJECTORY_K10",
                unattributed==null?"UNATTRIBUTED_NOT_QUANTIFIED_FOR_THIS_SCOPE":unattributed==0?"ALL_CASES_ATTRIBUTED":"UNATTRIBUTED_EXCLUDED",unattributed,
                definitions(),List.of("TBCall-held records only; not national surveillance totals or epidemiological coverage.",
                "Facility geography is matched exactly to the verified catalogue; missing, invalid and mismatched pairs are excluded.",
                "No historical geographic attribution or public snapshot history; transfers use the responsible facility at capture time.",
                "Case completion is not treatment success. Recorded outcomes are not inferred from status.",
                "Zero is an observed empty count in this approved snapshot; absent publication is unavailable, never zero.",
                "The prototype disclosure guard does not prove anonymity or legal compliance; external auxiliary information remains a limitation."));
    }
    private List<Definition> definitions() {
        String attribution="One verified current responsible case facility at snapshot capture; no referral join or event-place inference.",date="Stored state as of snapshot dataAsOf; no occurrence-date filter.";
        return List.of(
            new Definition("caseEpisodes","CASE_EPISODE","One tb_cases row per registration; all recorded case statuses; unverified geography excluded.",attribution,date,"Not unique patients or incidence."),
            new Definition("activeCaseEpisodes","CASE_EPISODE","tb_cases.status = ACTIVE only.",attribution,date,"REFERRED and other states are excluded."),
            new Definition("completedCaseEpisodes","CASE_EPISODE","tb_cases.status = COMPLETED only.",attribution,date,"Not cure or treatment success."),
            new Definition("activeTreatmentEpisodes","TREATMENT_EPISODE","treatments.status = ACTIVE linked to attributed case episodes.",attribution,date,"PLANNED and PAUSED excluded; current case geography, not historical treatment location."),
            new Definition("recordedTreatmentOutcomes","OUTCOME_RECORD","Explicit treatment_outcomes rows linked to attributed cases, without outcome-code filters.",attribution,date,"May include multiple historical treatment episodes; not a success rate or events in a period."),
            new Definition("representedFacilities","FACILITY","Distinct current responsible facility IDs of attributed case records, including inactive facilities with retained cases.",attribution,date,"Not all facilities, coverage or reporting completeness."));
    }
}
