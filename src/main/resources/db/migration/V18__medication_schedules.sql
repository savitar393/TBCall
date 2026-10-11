-- TBCall prescribed scheduling, independent of DoseEvent evidence and FollowUp appointments.
CREATE TABLE medication_schedules (
    id uuid PRIMARY KEY,
    treatment_id uuid NOT NULL UNIQUE REFERENCES treatments(id),
    current_revision_id uuid NOT NULL,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    status varchar(30) NOT NULL CHECK (status IN ('ACTIVE','CANCELLED')),
    created_by_user_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    cancelled_by_user_id uuid REFERENCES users(id),
    cancelled_at timestamptz,
    CONSTRAINT chk_medication_schedule_cancel CHECK (
        (status='ACTIVE' AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL)
        OR (status='CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL))
);
CREATE TABLE medication_schedule_revisions (
    id uuid PRIMARY KEY,
    schedule_id uuid NOT NULL REFERENCES medication_schedules(id),
    revision_number integer NOT NULL CHECK (revision_number > 0),
    status varchar(30) NOT NULL CHECK (status IN ('ACTIVE','SUPERSEDED','CANCELLED')),
    time_zone varchar(100) NOT NULL,
    start_date date NOT NULL,
    end_date date,
    weekday_mask integer NOT NULL CHECK (weekday_mask BETWEEN 1 AND 127),
    valid_from timestamptz NOT NULL,
    valid_until timestamptz,
    created_by_user_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL,
    retired_by_user_id uuid REFERENCES users(id),
    retired_at timestamptz,
    CONSTRAINT uq_medication_revision_number UNIQUE (schedule_id,revision_number),
    CONSTRAINT uq_medication_revision_owner UNIQUE (schedule_id,id),
    CONSTRAINT chk_medication_revision_dates CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_medication_revision_window CHECK (valid_until IS NULL OR valid_until >= valid_from),
    CONSTRAINT chk_medication_revision_retirement CHECK (
        (status='ACTIVE' AND retired_by_user_id IS NULL AND retired_at IS NULL AND valid_until IS NULL)
        OR (status IN ('SUPERSEDED','CANCELLED') AND retired_by_user_id IS NOT NULL AND retired_at IS NOT NULL)),
    CONSTRAINT chk_medication_revision_superseded CHECK (status <> 'SUPERSEDED' OR valid_until IS NOT NULL)
);
ALTER TABLE medication_schedules ADD CONSTRAINT fk_medication_current_revision
    FOREIGN KEY (id,current_revision_id) REFERENCES medication_schedule_revisions(schedule_id,id)
    DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX uq_medication_revision_active ON medication_schedule_revisions(schedule_id) WHERE status='ACTIVE';
CREATE INDEX idx_medication_revision_range ON medication_schedule_revisions(schedule_id,start_date,end_date);
CREATE TABLE medication_schedule_times (
    revision_id uuid NOT NULL REFERENCES medication_schedule_revisions(id),
    local_time time(0) WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (revision_id,local_time),
    CONSTRAINT chk_medication_time_minutes CHECK (EXTRACT(SECOND FROM local_time)=0 AND local_time < time '24:00')
);
