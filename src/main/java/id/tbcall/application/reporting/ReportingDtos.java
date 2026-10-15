package id.tbcall.application.reporting;

import java.time.*;
import java.util.*;

/** Public DTOs are explicit allowlists; private contribution ledgers never cross this boundary. */
public final class ReportingDtos {
    private ReportingDtos() {}
    public record Geography(String scope,String code,String name) {}
    public record Scopes(String catalogueVersion,List<Geography> scopes) {}
    public record Indicators(long caseEpisodes,long activeCaseEpisodes,long completedCaseEpisodes,
            long activeTreatmentEpisodes,long recordedTreatmentOutcomes,long representedFacilities) {}
    public record Cell(Geography geography,Indicators indicators) {}
    public record Summary(UUID snapshotId,OffsetDateTime dataAsOf,String state,Cell summary) {}
    public record Breakdown(UUID snapshotId,OffsetDateTime dataAsOf,String state,Geography geography,List<Cell> rows) {}
    public record Source(String url,String sha256) {}
    public record Definition(String code,String countingUnit,String inclusion,String attribution,String dateBasis,String limitation) {}
    public record Metadata(UUID snapshotId,OffsetDateTime dataAsOf,String dataSource,String reportingBasis,
            String catalogueVersion,String codeNamespace,LocalDate effectiveOn,LocalDate catalogueCheckedOn,List<Source> sources,
            Geography geography,int minimumPatientSupport,String disclosurePolicy,String dataQuality,
            Long unattributedCaseEpisodes,List<Definition> indicators,List<String> limitations) {}
    public record Grant(UUID id,UUID userId,String scope,String regionCode,String catalogueVersion,long version,
            OffsetDateTime assignedAt,OffsetDateTime revokedAt) {}
    public record Candidate(UUID id,long version,String state,OffsetDateTime dataAsOf,String catalogueVersion) {}
    // Internal, immutable persisted release. Aggregate fields are exposed only through the scoped DTOs above.
    public record Release(List<Cell> cells,long unattributedCaseEpisodes) {}
    public record Snapshot(Candidate candidate,Release release,Map<String,String> contributions) {}
}
