# TBCall Application/API v1.5A — SITB Integration Boundary Foundation

Base commit: `688e21cb805d5f664b87d911455ac582032dde42`

Status: approved foundation for future SITB integration. This phase deliberately performs **no SITB network/API calls**.

## 1. Why Phase 5A stops at the boundary

The SITB technical manual describes SITB as an interoperable national TB information system and states that the central SITB server has the highest authority in its online/offline architecture. It does not provide, in the supplied project sources, an authorized contemporary API contract, endpoint schema, authentication protocol, credential model, or write-back contract sufficient for TBCall to implement real networking safely.

Therefore Phase 5A prepares TBCall to integrate without inventing a SITB API.

Phase 5A implements:
- an explicit external-system record for SITB, disabled by default;
- external record identifiers already supported by V1;
- explicit external source-authority registrations;
- reconciliation/conflict ledger;
- sync-run/read introspection;
- source-authority enforcement in existing domain policies.

Phase 5A does **not** implement:
- HTTP/SOAP/browser automation against SITB;
- credentials/tokens;
- guessed SITB endpoint paths;
- guessed SITB database/schema identifiers;
- inbound/outbound record mapping;
- automatic reconciliation;
- write-back.

## 2. Existing integration model retained

V1 already provides:

- `external_systems`
- `external_identifiers`
- `sync_runs`
- `sync_items`

Do not replace them.

`external_identifiers` remains the canonical mapping:

TBCall entity UUID <-> external-system entity ID/version.

Presence of an external identifier alone does **not** make the external source authoritative. Authority is explicit and separate.

## 3. V17 migration

Create:

`V17__integration_boundary_source_authority.sql`

Do not modify V1–V16.

### 3.1 SITB external-system marker

Insert one TBCall-internal external-system descriptor:

```sql
INSERT INTO external_systems(code, name, description, active)
VALUES (
    'SITB',
    'Sistem Informasi Tuberkulosis (SITB)',
    'TBCall integration boundary. Network/API contract and credentials are not configured.',
    false
)
ON CONFLICT (code) DO NOTHING;
```

`SITB` is a TBCall internal external-system code, not a claim about an official SITB API identifier.

It remains `active=false` until a separately approved network integration phase has an authorized interface and credentials.

### 3.2 External source authority

Create:

```sql
CREATE TABLE external_source_authorities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id  uuid NOT NULL REFERENCES external_systems(id),

    entity_type         varchar(80) NOT NULL,
    entity_id           uuid NOT NULL,

    authority_scope     varchar(80) NOT NULL,

    external_id         varchar(255),
    source_version      varchar(100),

    effective_at        timestamptz NOT NULL DEFAULT now(),
    released_at         timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_external_authority_release
        CHECK (released_at IS NULL OR released_at >= effective_at)
);
```

One currently-effective external authority per entity/scope:

```sql
CREATE UNIQUE INDEX uq_external_source_authority_active
ON external_source_authorities(entity_type, entity_id, authority_scope)
WHERE released_at IS NULL;
```

Indexes:

```sql
CREATE INDEX idx_external_source_authority_system
ON external_source_authorities(external_system_id, authority_scope, effective_at DESC);

CREATE INDEX idx_external_source_authority_entity
ON external_source_authorities(entity_type, entity_id, authority_scope);
```

Current TBCall authority scopes:

- `CLINICAL`
- `LABORATORY`
- `REFERRAL`
- `CONTACT_TPT`
- `MONITORING`

They are TBCall authority-domain codes, not SITB codes.

Do not add a SQL CHECK for authority_scope in V17 so a future approved integration contract can add a narrower scope without rewriting historical migration semantics. Application services use the allowlist above for Phase 5A.

### 3.3 Integration conflict ledger

Create:

```sql
CREATE TABLE integration_conflicts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id  uuid NOT NULL REFERENCES external_systems(id),

    entity_type         varchar(80) NOT NULL,
    entity_id           uuid,
    external_id         varchar(255) NOT NULL,
    authority_scope     varchar(80) NOT NULL,

    local_content_hash  varchar(128),
    source_content_hash varchar(128),
    source_version      varchar(100),

    status              varchar(30) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN (
                            'OPEN',
                            'RESOLVED_LOCAL',
                            'RESOLVED_EXTERNAL',
                            'IGNORED'
                        )),

    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    resolved_at         timestamptz,

    resolution_note     text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_integration_conflict_times
        CHECK (
            last_seen_at >= first_seen_at
            AND (resolved_at IS NULL OR resolved_at >= first_seen_at)
        )
);
```

One unresolved conflict for the same external record/scope:

```sql
CREATE UNIQUE INDEX uq_integration_conflict_open
ON integration_conflicts(
    external_system_id,
    entity_type,
    external_id,
    authority_scope
)
WHERE status = 'OPEN';
```

Indexes:

```sql
CREATE INDEX idx_integration_conflict_status
ON integration_conflicts(external_system_id, status, last_seen_at DESC);

CREATE INDEX idx_integration_conflict_entity
ON integration_conflicts(entity_type, entity_id);
```

Phase 5A does not automatically create or resolve conflicts because no authorized source adapter exists yet. The table is a durable boundary for the later connector.

### 3.4 Sync-item reconciliation linkage

Extend `sync_items`:

```sql
ALTER TABLE sync_items
    ADD COLUMN local_content_hash varchar(128),
    ADD COLUMN conflict_id uuid REFERENCES integration_conflicts(id);
```

Do not change existing operation/status codes.

Do not add automatic payload persistence.

## 4. JPA/domain mappings

Add entities/mappings for:
- `ExternalSourceAuthority`
- `IntegrationConflict`

Extend `SyncItem` for:
- `localContentHash`
- `conflict`

No generic repository may mutate clinical domain rows through these entities.

## 5. ExternalAuthorityRegistry

Add a read-focused component:

`ExternalAuthorityRegistry`

Suggested API:

```java
boolean isExternallyAuthoritative(
    String entityType,
    UUID entityId,
    String authorityScope
);

Optional<AuthorityDescriptor> activeAuthority(
    String entityType,
    UUID entityId,
    String authorityScope
);

void requireLocallyWritable(
    String entityType,
    UUID entityId,
    String authorityScope
);
```

`requireLocallyWritable`:
- succeeds when no active external authority exists;
- throws HTTP 409:
  - code: `SOURCE_AUTHORITY_CONFLICT`
  - title: `Sumber data tidak mengizinkan perubahan lokal`
  - Indonesian detail explaining that the record is controlled by an external authoritative source and must be reconciled through the integration workflow.

Do not expose credentials, raw payload or external-system internals in the error.

Authority reads are `READ_COMMITTED`/read-only.

## 6. Integrate the existing source-authority policies

Existing permission/facility/role checks remain first.

After those checks, prototype source policies consult `ExternalAuthorityRegistry`.

### ClinicalSourceAuthorityPolicy

Scope: `CLINICAL`

Resource types currently passed by clinical services remain unchanged.

For create:
- no existing entity ID means there is no imported entity authority to check;
- creation remains local unless a future connector contract introduces an externally-reserved identity workflow.

For edit:
- if the target entity/resource has active external `CLINICAL` authority, return SOURCE_AUTHORITY_CONFLICT.

### LaboratorySourceAuthorityPolicy

Scope: `LABORATORY`

Local create/edit is blocked only when the existing target resource is explicitly externally authoritative for LABORATORY.

Do not infer authority from laboratory facility, external referral type, or external identifier alone.

### ReferralSourceAuthorityPolicy

Scope: `REFERRAL`

Block local transition when the Referral entity has active external REFERRAL authority.

Case external authority does not automatically imply Referral authority.

### ContactSourceAuthorityPolicy

Scope: `CONTACT_TPT`

- contact write -> Contact entity authority
- investigation transition -> ContactInvestigation entity authority
- TPT write -> PreventiveTreatment entity authority

Do not infer TPT authority from the index case.

### MonitoringSourceAuthorityPolicy

Scope: `MONITORING`

Block local plan/event management only when the MonitoringPlan is explicitly externally authoritative.

External Treatment/TPT authority does not automatically make TBCall operational monitoring externally owned.

This preserves the independence established in Phases 3–4.

## 7. Authority registration is internal-only in Phase 5A

Do **not** add an HTTP endpoint that lets administrators arbitrarily mark clinical records as SITB authoritative.

Future connector/import code will register authority inside a separately approved integration transaction.

Tests may persist authority rows directly through fixtures/repositories.

This prevents the current prototype from pretending to have authenticated SITB ownership when no network contract exists.

## 8. Integration administration read APIs

SYSTEM_ADMIN + INTEGRATION_MANAGE only.

Implement safe read-only introspection:

- GET `/api/v1/integrations`
- GET `/api/v1/integrations/{code}`
- GET `/api/v1/integrations/{code}/external-identifiers`
- GET `/api/v1/integrations/{code}/authorities`
- GET `/api/v1/integrations/{code}/sync-runs`
- GET `/api/v1/integrations/{code}/sync-runs/{runId}`
- GET `/api/v1/integrations/{code}/conflicts`

Pagination max 50.

### `/integrations`

Return:
- code
- name
- active
- description
- number of identifiers
- number of active authority registrations
- latest sync-run summary if present

For SITB it must clearly report inactive/unconfigured in Phase 5A.

### External identifier projection

Return:
- id/version if entity has one
- entityType
- entityId
- externalId
- externalVersion
- firstSeenAt/lastSeenAt

No patient names/clinical payload.

### Authority projection

Return:
- entityType/entityId
- authorityScope
- externalId
- sourceVersion
- effectiveAt/releasedAt

### Sync run projection

Return:
- id/direction/status
- startedAt/finishedAt
- counters
- cursorValue
- error summary

Do not expose `sync_items.raw_payload`.

Run detail may include safe sync-item fields:
- entityType
- externalId
- resolvedEntityId
- operation/status
- sourceUpdatedAt
- contentHash/localContentHash
- conflictId
- processedAt
- error summary

### Conflict projection

Return:
- id
- entityType/entityId
- externalId
- authorityScope
- sourceVersion
- status
- firstSeenAt/lastSeenAt/resolvedAt

Do not expose `resolutionNote` to generic list if it may contain operator text; detail endpoint is deferred until a resolution workflow exists.

## 9. No integration write APIs

Phase 5A adds no:
- start-sync endpoint;
- import endpoint;
- push endpoint;
- conflict-resolution endpoint;
- external identifier mutation endpoint;
- external authority mutation endpoint;
- credential endpoint.

This is intentional.

## 10. Security

All integration read endpoints:
- role SYSTEM_ADMIN
- permission INTEGRATION_MANAGE

FACILITY_ADMIN, PROGRAM_MONITOR, TB_OFFICER, LAB_STAFF, PATIENT and TREATMENT_SUPPORTER have no access.

Non-enumerating behavior:
- unknown integration code -> 404
- inaccessible records -> 404 where appropriate

No credential material is stored in the database.

Future credentials must use deployment secret storage/environment integration, not `external_systems.description` or sync tables.

## 11. Raw payload policy

V1 contains `sync_items.raw_payload`.

Phase 5A application code:
- never populates raw_payload;
- never exposes raw_payload through APIs;
- never logs raw payload;
- never copies raw payload into audit metadata.

When an authorized SITB adapter is designed, raw-payload retention must be explicitly approved with privacy/retention rules.

## 12. Audit

Read-only integration browsing does not need success audit rows.

Source-authority write denial continues through the existing authorization/source-authority error path and must not produce a false success audit.

If useful, add a correlation-only action:

`SOURCE_AUTHORITY_WRITE_BLOCKED`

only when the codebase has an existing reliable denial-audit transaction pattern that survives rollback. Do not redesign denial auditing merely for Phase 5A.

## 13. Concurrency/integrity

PostgreSQL tests:

- one active external authority per entity/scope;
- released historical authority permits a new active registration;
- one OPEN conflict per external record/scope;
- resolved conflict permits a new OPEN conflict;
- sync item can reference conflict;
- external identifier uniqueness remains unchanged.

Authority lookup during a clinical write is advisory to source ownership but must execute inside the same application transaction as the write.

No new retry loops.

Because no connector mutates authority concurrently in Phase 5A, do not invent distributed locking.

Future inbound synchronization must define its lock order before it can write clinical rows.

## 14. Tests

Baseline: 719 tests.

At minimum:

### Migration
- V1–V17 fresh migration + Hibernate validate
- V16->V17 upgrade
- V1–V16 unchanged
- SITB row exists, active=false
- current generic integration tables preserved
- source-authority uniqueness/history
- conflict uniqueness/history
- sync-item new fields

### Source authority
For each policy family:
- local resource without authority remains writable exactly as before
- matching active external authority returns 409 SOURCE_AUTHORITY_CONFLICT
- unrelated authority scope does not block
- released authority does not block
- external identifier without authority does not block

Cover:
- clinical edit
- lab edit
- referral transition
- contact write
- investigation transition
- TPT write
- monitoring manage

Do not change patient/supporter adherence behavior merely because a Treatment has external CLINICAL authority unless the existing clinical source policy is actually used by that route.

### Integration admin
- SYSTEM_ADMIN + INTEGRATION_MANAGE can read
- all clinical/facility/program/lab/patient/supporter roles denied
- SITB reported inactive/unconfigured
- safe identifier/authority/sync/conflict projections
- raw_payload never returned
- no mutation routes exist

### Regression
- all 719 existing tests remain green
- no networking occurs in tests
- no external host is required
- build works with Docker Desktop/Testcontainers only

Run:

```powershell
.\mvnw.cmd clean test
```

## 15. Documentation

Add:
- `docs/INTEGRATION_BOUNDARY.md`
- `docs/PHASE5A_REPORT.md`

Update:
- README
- `docs/AUTHORIZATION.md`

Commit architecture:
- `docs/architecture/TBCall_Application_API_v1.5A_SITB_Integration_Boundary.md`

Document explicitly:
- SITB workflow/manual evidence is not an API contract;
- external_system code SITB is TBCall-internal;
- SITB remains inactive;
- no credentials/network/write-back;
- external identifiers are not authority;
- source authority is domain-specific and explicit.

## 16. Deferred to Phase 5B — only after authorized SITB interface material exists

Do not design the physical connector from guesses.

Phase 5B requires actual authorized material such as:
- official/current endpoint or interoperability specification;
- authentication/credential requirements;
- permitted environments/sandbox;
- entity identifiers/versioning;
- read/write permissions;
- rate/error semantics;
- authoritative field ownership;
- webhook/polling/cursor behavior if any;
- privacy/logging/retention requirements.

Only then define:
- real gateway DTOs;
- mapping;
- inbound/outbound sync;
- conflict resolution;
- idempotency;
- write-back;
- credential rotation;
- network resilience.

If those materials are unavailable, TBCall stops at the Phase 5A boundary rather than scraping or automating the SITB web UI.
