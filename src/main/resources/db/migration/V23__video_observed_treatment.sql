-- Private, synthetic-development video evidence. Never medication adherence or DoseEvent.
CREATE TABLE vot_submissions (
    id uuid PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patients(id),
    treatment_id uuid NOT NULL REFERENCES treatments(id),
    schedule_id uuid NOT NULL REFERENCES medication_schedules(id),
    revision_id uuid NOT NULL,
    occurrence_id varchar(100) NOT NULL,
    local_date date NOT NULL,
    local_time time(0) WITHOUT TIME ZONE NOT NULL,
    time_zone varchar(100) NOT NULL,
    scheduled_at timestamptz NOT NULL,
    uploaded_by_user_id uuid NOT NULL REFERENCES users(id),
    patient_link_id uuid NOT NULL REFERENCES patient_user_links(id),
    media_key varchar(36) NOT NULL UNIQUE,
    content_type varchar(30) NOT NULL CHECK (content_type IN ('video/webm','video/mp4')),
    media_size bigint NOT NULL CHECK (media_size BETWEEN 1 AND 20971520),
    submitted_at timestamptz NOT NULL,
    status varchar(30) NOT NULL CHECK (status IN ('PENDING_REVIEW','OBSERVED','NOT_VERIFIABLE','CANCELLED')),
    consent_acknowledged boolean NOT NULL CHECK (consent_acknowledged),
    consent_policy_version varchar(60) NOT NULL,
    reviewed_at timestamptz,
    reviewed_by_user_id uuid REFERENCES users(id),
    review_notes varchar(2000),
    cancelled_at timestamptz,
    cancelled_by_user_id uuid REFERENCES users(id),
    retention_expires_at timestamptz NOT NULL,
    media_deleted_at timestamptz,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT fk_vot_revision_owner FOREIGN KEY (schedule_id,revision_id) REFERENCES medication_schedule_revisions(schedule_id,id),
    CONSTRAINT uq_vot_occurrence UNIQUE (schedule_id,scheduled_at),
    CONSTRAINT chk_vot_retention CHECK (retention_expires_at>submitted_at),
    CONSTRAINT chk_vot_review CHECK (
        (status IN ('OBSERVED','NOT_VERIFIABLE') AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL)
        OR (status IN ('PENDING_REVIEW','CANCELLED') AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL AND review_notes IS NULL)),
    CONSTRAINT chk_vot_cancel CHECK ((status='CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL)
        OR (status<>'CANCELLED' AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL))
);
CREATE INDEX idx_vot_patient_history ON vot_submissions(patient_id,submitted_at DESC,id);
CREATE INDEX idx_vot_treatment_queue ON vot_submissions(treatment_id,status,submitted_at,id);
CREATE INDEX idx_vot_pending_queue ON vot_submissions(status,submitted_at,id);
CREATE INDEX idx_vot_retention ON vot_submissions(retention_expires_at,id) WHERE media_deleted_at IS NULL;

INSERT INTO permissions(code,name) VALUES
    ('VOT_SELF_READ','Melihat video pengobatan sendiri'),
    ('VOT_SELF_WRITE','Mengirim dan membatalkan video pengobatan sendiri'),
    ('VOT_REVIEW_READ','Melihat video untuk peninjauan dalam lingkup fasyankes'),
    ('VOT_REVIEW_WRITE','Mencatat peninjauan video pengobatan');
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON
    (r.code='PATIENT' AND p.code IN ('VOT_SELF_READ','VOT_SELF_WRITE')) OR
    (r.code='TB_OFFICER' AND p.code IN ('VOT_REVIEW_READ','VOT_REVIEW_WRITE'));
