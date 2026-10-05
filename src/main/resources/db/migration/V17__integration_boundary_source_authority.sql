-- SITB is a TBCall-internal integration descriptor, not an authorized API contract.
INSERT INTO external_systems(code, name, description, active)
VALUES (
    'SITB',
    'Sistem Informasi Tuberkulosis (SITB)',
    'TBCall integration boundary. Network/API contract and credentials are not configured.',
    false
)
ON CONFLICT (code) DO NOTHING;

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

CREATE UNIQUE INDEX uq_external_source_authority_active
ON external_source_authorities(entity_type, entity_id, authority_scope)
WHERE released_at IS NULL;

CREATE INDEX idx_external_source_authority_system
ON external_source_authorities(external_system_id, authority_scope, effective_at DESC);

CREATE INDEX idx_external_source_authority_entity
ON external_source_authorities(entity_type, entity_id, authority_scope);

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
                        CHECK (status IN ('OPEN','RESOLVED_LOCAL','RESOLVED_EXTERNAL','IGNORED')),
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

CREATE UNIQUE INDEX uq_integration_conflict_open
ON integration_conflicts(external_system_id, entity_type, external_id, authority_scope)
WHERE status = 'OPEN';

CREATE INDEX idx_integration_conflict_status
ON integration_conflicts(external_system_id, status, last_seen_at DESC);

CREATE INDEX idx_integration_conflict_entity
ON integration_conflicts(entity_type, entity_id);

ALTER TABLE sync_items
    ADD COLUMN local_content_hash varchar(128),
    ADD COLUMN conflict_id uuid REFERENCES integration_conflicts(id);
