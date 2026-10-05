package id.tbcall.application.integration;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** TBCall administrative metadata only; persistence entities are never serialized. */
public final class IntegrationDtos {
    private IntegrationDtos() {}
    public record Page<T>(List<T> content, int page, int size, long totalElements) {}
    public record IntegrationSummary(String code, String name, boolean active, String configurationStatus,
            String description, long identifierCount, long activeAuthorityCount, RunSummary latestSyncRun) {}
    public record IdentifierSummary(UUID id, String entityType, UUID entityId, String externalId,
            String externalVersion, OffsetDateTime firstSeenAt, OffsetDateTime lastSeenAt) {}
    public record AuthoritySummary(String entityType, UUID entityId, String authorityScope, String externalId,
            String sourceVersion, OffsetDateTime effectiveAt, OffsetDateTime releasedAt) {}
    public record RunSummary(UUID id, String direction, String status, OffsetDateTime startedAt,
            OffsetDateTime finishedAt, int recordsReceived, int recordsCreated, int recordsUpdated,
            int recordsFailed, String cursorValue, String errorSummary) {}
    public record RunDetail(RunSummary run, Page<ItemSummary> items) {}
    public record ItemSummary(String entityType, String externalId, UUID resolvedEntityId, String operation,
            String status, OffsetDateTime sourceUpdatedAt, String contentHash, String localContentHash,
            UUID conflictId, OffsetDateTime processedAt, String errorSummary) {}
    public record ConflictSummary(UUID id, String entityType, UUID entityId, String externalId,
            String authorityScope, String sourceVersion, String status, OffsetDateTime firstSeenAt,
            OffsetDateTime lastSeenAt, OffsetDateTime resolvedAt) {}
}
