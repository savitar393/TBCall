# Phase 5A — integration boundary and source authority

Contract: [approved v1.5A architecture](architecture/TBCall_Application_API_v1.5A_SITB_Integration_Boundary.md).

This phase provides local metadata and source ownership only. The supplied SITB workflow/manual evidence is not an authorized API, authentication or physical schema contract. `SITB` is TBCall's internal external-system code. V17 seeds it inactive with an explicit unconfigured description. No credentials, endpoints, network calls, scraping, browser automation, import, write-back or reconciliation worker exist.

## Persistence

V1–V16 remain immutable. V17 retains external_systems/external_identifiers/sync_runs/sync_items, adds external_source_authorities and integration_conflicts, and adds sync_items.local_content_hash/conflict_id. Existing operation/status codes are unchanged. All primary keys remain TBCall UUIDs; external identifiers never replace them.

An authority registration uses `(entity_type, entity_id, authority_scope)`. `released_at IS NULL` defines an active registration, with at most one active owner across all external systems. Released rows remain history. Release cannot precede effective_at. Authority scopes used by Phase 5A are TBCall canonical codes; SQL deliberately leaves future approved scopes possible.

Conflicts retain external system/entity type/external ID/scope, optional resolved local UUID, hashes/version and lifecycle timestamps. At most one OPEN conflict exists for that external record/scope. RESOLVED_LOCAL, RESOLVED_EXTERNAL and IGNORED permit later OPEN history. No code automatically creates or resolves these rows. New JPA references are lazy and unidirectional, with no clinical cascade or generic domain mutation service. No version columns were added to these new ledgers.

## Source-policy enforcement

Existing permission, role and facility checks run first. The registry then queries the exact target under read-only READ_COMMITTED semantics, joining the existing write transaction. A matching active authority produces HTTP 409:

- code: `SOURCE_AUTHORITY_CONFLICT`
- title: `Sumber data tidak mengizinkan perubahan lokal`
- detail: `Data ini dikendalikan oleh sumber eksternal yang berwenang. Perubahan harus direkonsiliasi melalui alur integrasi yang disetujui.`

The error contains no external identifiers, system internals, credentials or payload.

| Policy | Entity checked | Scope |
|---|---|---|
| Clinical | Current resource type/ID passed by the existing service, including PATIENT/TB_REGISTRATION/DIAGNOSIS/TB_CASE/TREATMENT/FOLLOW_UP/ADVERSE_EVENT | CLINICAL |
| Laboratory | Current LAB_REQUEST/LAB_SPECIMEN/LAB_RESULT target | LABORATORY |
| Referral transition | REFERRAL | REFERRAL |
| Contact write | CONTACT | CONTACT_TPT |
| Investigation transition | CONTACT_INVESTIGATION | CONTACT_TPT |
| TPT write | PREVENTIVE_TREATMENT | CONTACT_TPT |
| Monitoring plan/event management | MONITORING_PLAN (event commands use their plan ID) | MONITORING |

Identifiers alone, external laboratory facilities/referrals, parent authority, unrelated type/ID/scope and released authority do not block. Creation without an existing target UUID remains local. Explicit authority remains effective even if the external-system activation flag is false: that flag describes integration activation, not record ownership.

Adherence routes retain their existing independent behavior and do not acquire clinical authority checks. Automatic monitoring sweeps retain existing behavior; this phase integrates the existing command policies and adds no new sweep ownership rules. No authorization grants or clinical service transitions change.

Authority is advisory to ownership within the current transaction; no connector mutates authority concurrently in this phase. Future synchronization must define its own lock order before writing domain rows. No retry/distributed-lock mechanism is introduced.

## Administrator GET routes

Every route requires both **SYSTEM_ADMIN** and **INTEGRATION_MANAGE**, using the existing administrative authorization policy. Other roles have no integration access even if manually granted the permission. Existing session authentication remains required. Unknown system codes and absent/wrong-system sync-run IDs return 404 after authorization.

| Method | Route | Projection |
|---|---|---|
| GET | `/api/v1/integrations` | Paginated system metadata, identifier/active-authority counts, latest run summary |
| GET | `/api/v1/integrations/{code}` | Same system summary |
| GET | `/api/v1/integrations/{code}/external-identifiers` | Local UUID mapping, external ID/version and first/last seen |
| GET | `/api/v1/integrations/{code}/authorities` | Entity/scope, external ID/version, effective/released timestamps; includes history |
| GET | `/api/v1/integrations/{code}/sync-runs` | Run identity/direction/status/timestamps/counters/cursor/safe error summary |
| GET | `/api/v1/integrations/{code}/sync-runs/{runId}` | Run summary plus paginated safe sync-item metadata, hashes and conflict ID |
| GET | `/api/v1/integrations/{code}/conflicts` | Conflict identity/record/scope/version/status/timestamps; includes history |

Lists use `{content,page,size,totalElements}`, default page 0/size 20, max size 50, stable timestamp/UUID ordering (systems by code/UUID). Run-detail page/size apply to its `items` page. Negative, zero/oversized and offset-overflow pagination is rejected. There are no start-sync, import, push, resolution, identifier/authority mutation or credential routes. Unsupported methods on existing GET patterns return 405; absent paths return 404.

System summaries always report `configurationStatus=UNCONFIGURED`, because no connector exists in Phase 5A. `active` is persisted metadata; the fresh SITB descriptor is false. Activation alone does not configure any gateway or networking.

## Projection/privacy and audit

Dedicated DTOs are built from explicit SQL columns. No query selects sync_items.raw_payload or free-text error_message values. Error summaries use a fixed Indonesian message based only on error presence. No patient names, clinical payloads, resolution_note, audit metadata or credential material are returned. The approved cursorValue/external-ID/version/hash fields remain metadata; future authorized contracts must define safe cursor and identifier handling.

This phase never populates, mutates, logs, exposes or copies raw payload into audit metadata. Privacy tests seed deliberately private test-only raw payload/error/operator text to prove exclusion; those fixtures are local TBCall rows, not a fake SITB database/API.

Successful integration browsing creates no audit rows. Existing authorization denial auditing remains. Source-authority conflicts roll back existing writes and cannot create success audits. The optional SOURCE_AUTHORITY_WRITE_BLOCKED action is not added; no denial-audit redesign is required.

No credentials are stored or requested. Future credentials belong in deployment secret storage, never descriptions or sync tables.

## Before Phase 5B

Require authorized current interface material covering endpoints/interoperability, authentication/credentials, permitted sandbox/environments, entity IDs/versioning, read/write permissions, rate/error semantics, field ownership, polling/webhooks/cursors and privacy/logging/retention. Only then approve gateway DTOs, mapping, inbound/outbound transactions/lock order, idempotency, conflict resolution, write-back, credential rotation and resilience. Without that material, stop at this local boundary.
