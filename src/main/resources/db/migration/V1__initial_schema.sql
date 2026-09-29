-- TBCall Database Schema v1
-- PostgreSQL 15+
-- Purpose:
--   Production-oriented prototype schema for TBCall, aligned conceptually with
--   the official SITB technical manual while remaining independent from any
--   undocumented SITB physical database/API schema.
--
-- Source ownership:
--   SITB-aligned / future external authority:
--     patients, tb_registrations, diagnoses, tb_cases, laboratory data,
--     treatments, outcomes, referrals/transfers, contacts, preventive treatment.
--   TBCall-owned:
--     users/authentication, user-patient links, monitoring, alerts,
--     notifications, synchronization metadata, audit data.
--
-- Reference data are intentionally created as tables instead of hard-coded
-- PostgreSQL enums so future SITB/national-program code changes do not require
-- destructive enum migrations.
--
-- Reference rows / application seed data should be added in a later migration,
-- e.g. V2__reference_data.sql.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ============================================================
-- Reference / configurable clinical code tables
-- ============================================================

CREATE TABLE facility_types (
    code            varchar(50) PRIMARY KEY,
    name            varchar(150) NOT NULL,
    description     text,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE sex_codes (
    code            varchar(30) PRIMARY KEY,
    name            varchar(100) NOT NULL,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE tb_suspect_types (
    code            varchar(30) PRIMARY KEY,
    name            varchar(150) NOT NULL,
    description     text,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE anatomical_sites (
    code            varchar(30) PRIMARY KEY,
    name            varchar(150) NOT NULL,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE diagnosis_types (
    code            varchar(50) PRIMARY KEY,
    name            varchar(150) NOT NULL,
    description     text,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE previous_treatment_categories (
    code            varchar(80) PRIMARY KEY,
    name            varchar(200) NOT NULL,
    description     text,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE hiv_statuses (
    code            varchar(30) PRIMARY KEY,
    name            varchar(100) NOT NULL,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE dm_statuses (
    code            varchar(30) PRIMARY KEY,
    name            varchar(100) NOT NULL,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE pregnancy_statuses (
    code            varchar(30) PRIMARY KEY,
    name            varchar(100) NOT NULL,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE bcg_statuses (
    code            varchar(30) PRIMARY KEY,
    name            varchar(100) NOT NULL,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE tb_case_categories (
    code            varchar(30) PRIMARY KEY,
    name            varchar(150) NOT NULL,
    description     text,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE lab_test_types (
    code            varchar(60) PRIMARY KEY,
    name            varchar(200) NOT NULL,
    description     text,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE lab_request_reasons (
    code            varchar(40) PRIMARY KEY,
    name            varchar(150) NOT NULL,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE treatment_outcome_codes (
    code            varchar(60) PRIMARY KEY,
    name            varchar(200) NOT NULL,
    description     text,
    active          boolean NOT NULL DEFAULT true
);

-- ============================================================
-- Facilities
-- ============================================================

CREATE TABLE facilities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_type_code  varchar(50) REFERENCES facility_types(code),
    parent_facility_id  uuid REFERENCES facilities(id),

    name                varchar(255) NOT NULL,
    address             text,
    province_code       varchar(20),
    regency_code        varchar(20),
    district_code       varchar(20),
    village_code        varchar(20),
    postal_code         varchar(10),

    latitude            numeric(9,6),
    longitude           numeric(9,6),

    active              boolean NOT NULL DEFAULT true,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_facilities_latitude
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_facilities_longitude
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_facilities_name ON facilities(name);
CREATE INDEX idx_facilities_region
    ON facilities(province_code, regency_code, district_code, village_code);

-- ============================================================
-- Authentication / RBAC (TBCall-owned)
-- ============================================================

CREATE TABLE users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email               citext,
    phone               varchar(30),
    password_hash       varchar(255) NOT NULL,

    status              varchar(30) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','DISABLED')),

    email_verified_at   timestamptz,
    phone_verified_at   timestamptz,
    last_login_at       timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_users_login_identity
        CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX uq_users_email
    ON users(email)
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX uq_users_phone
    ON users(phone)
    WHERE phone IS NOT NULL;

CREATE TABLE roles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            varchar(60) NOT NULL UNIQUE,
    name            varchar(150) NOT NULL,
    description     text,
    system_role     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            varchar(100) NOT NULL UNIQUE,
    name            varchar(150) NOT NULL,
    description     text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at     timestamptz NOT NULL DEFAULT now(),
    assigned_by     uuid REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
    role_id         uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_facilities (
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id     uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    is_primary      boolean NOT NULL DEFAULT false,
    active          boolean NOT NULL DEFAULT true,
    assigned_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, facility_id)
);

CREATE UNIQUE INDEX uq_user_primary_facility
    ON user_facilities(user_id)
    WHERE is_primary = true AND active = true;

CREATE TABLE user_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      varchar(255) NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz,
    ip_address      inet,
    user_agent      text,
    CONSTRAINT chk_user_sessions_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_user_sessions_user
    ON user_sessions(user_id, expires_at);

CREATE TABLE user_verification_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose         varchar(40) NOT NULL
                    CHECK (purpose IN (
                        'EMAIL_VERIFICATION',
                        'PHONE_VERIFICATION',
                        'PASSWORD_RESET',
                        'PATIENT_LINK'
                    )),
    token_hash      varchar(255) NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz,
    CONSTRAINT chk_verification_token_expiry CHECK (expires_at > created_at)
);

-- ============================================================
-- Patient identity
-- ============================================================

CREATE TABLE patients (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    nik                     varchar(16),
    other_identity_number   varchar(100),
    bpjs_number             varchar(50),

    full_name               varchar(255) NOT NULL,
    citizenship             varchar(50),
    birth_place             varchar(150),
    birth_date              date,
    birth_date_unknown      boolean NOT NULL DEFAULT false,
    sex_code                varchar(30) REFERENCES sex_codes(code),

    phone                   varchar(30),

    address                 text,
    province_code           varchar(20),
    regency_code            varchar(20),
    district_code           varchar(20),
    village_code            varchar(20),

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_patients_nik
        CHECK (nik IS NULL OR nik ~ '^[0-9]{16}$')
);

CREATE UNIQUE INDEX uq_patients_nik
    ON patients(nik)
    WHERE nik IS NOT NULL;

CREATE UNIQUE INDEX uq_patients_bpjs
    ON patients(bpjs_number)
    WHERE bpjs_number IS NOT NULL;

CREATE INDEX idx_patients_full_name
    ON patients USING gin (full_name gin_trgm_ops);

CREATE INDEX idx_patients_phone
    ON patients(phone);

CREATE INDEX idx_patients_region
    ON patients(province_code, regency_code, district_code, village_code);

CREATE TABLE patient_user_links (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id          uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    relationship_type   varchar(50) NOT NULL DEFAULT 'SELF',
    verification_status varchar(30) NOT NULL DEFAULT 'PENDING'
                        CHECK (verification_status IN (
                            'PENDING','VERIFIED','REJECTED','REVOKED'
                        )),

    verified_at         timestamptz,
    verified_by         uuid REFERENCES users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (user_id, patient_id, relationship_type)
);

CREATE INDEX idx_patient_user_links_patient
    ON patient_user_links(patient_id, verification_status);

-- ============================================================
-- Terduga / registration episode
-- ============================================================

CREATE TABLE tb_registrations (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id                      uuid NOT NULL REFERENCES patients(id),
    facility_id                     uuid NOT NULL REFERENCES facilities(id),

    registration_date               date NOT NULL,
    facility_registration_number    varchar(100),
    medical_record_number           varchar(100),
    specimen_identity_number        varchar(100),

    suspect_type_code               varchar(30) REFERENCES tb_suspect_types(code),
    previous_treatment_category_code varchar(80)
                                    REFERENCES previous_treatment_categories(code),

    referred_by_type                varchar(50),
    referred_by_reference           varchar(255),
    referral_notes                  text,

    initial_weight_kg               numeric(6,2),
    hiv_status_code                 varchar(30) REFERENCES hiv_statuses(code),
    dm_status_code                  varchar(30) REFERENCES dm_statuses(code),

    status                          varchar(30) NOT NULL DEFAULT 'OPEN'
                                    CHECK (status IN (
                                        'OPEN',
                                        'DIAGNOSED',
                                        'CONVERTED_TO_CASE',
                                        'CLOSED',
                                        'CANCELLED'
                                    )),

    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_tb_reg_weight
        CHECK (initial_weight_kg IS NULL OR initial_weight_kg > 0)
);

CREATE UNIQUE INDEX uq_tb_reg_facility_number
    ON tb_registrations(facility_id, facility_registration_number)
    WHERE facility_registration_number IS NOT NULL;

CREATE INDEX idx_tb_reg_patient_date
    ON tb_registrations(patient_id, registration_date DESC);

CREATE INDEX idx_tb_reg_facility_date
    ON tb_registrations(facility_id, registration_date DESC);

CREATE INDEX idx_tb_reg_status
    ON tb_registrations(status);

-- ============================================================
-- Diagnosis
-- ============================================================

CREATE TABLE diagnoses (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id         uuid NOT NULL REFERENCES tb_registrations(id),

    diagnosis_date          date NOT NULL,
    anatomical_site_code    varchar(30) REFERENCES anatomical_sites(code),
    diagnosis_type_code     varchar(50) REFERENCES diagnosis_types(code),
    diagnosis_result        varchar(255),

    chest_xray_result       varchar(50),
    chest_xray_date         date,
    chest_xray_serial       varchar(100),
    chest_xray_impression   text,

    icd10_code              varchar(20),

    treatment_disposition   varchar(30)
                            CHECK (treatment_disposition IS NULL OR
                                   treatment_disposition IN (
                                       'TREAT_HERE',
                                       'REFERRED',
                                       'NOT_TREATED',
                                       'UNKNOWN'
                                   )),
    referred_to_facility_id uuid REFERENCES facilities(id),

    notes                   text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_diagnosis_referral_target
        CHECK (
            treatment_disposition <> 'REFERRED'
            OR referred_to_facility_id IS NOT NULL
        )
);

CREATE INDEX idx_diagnoses_registration
    ON diagnoses(registration_id, diagnosis_date DESC);

-- ============================================================
-- Confirmed TB case
-- ============================================================

CREATE TABLE tb_cases (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id                 uuid NOT NULL UNIQUE
                                    REFERENCES tb_registrations(id),
    confirming_diagnosis_id         uuid UNIQUE REFERENCES diagnoses(id),
    current_facility_id             uuid NOT NULL REFERENCES facilities(id),

    case_category_code              varchar(30) REFERENCES tb_case_categories(code),

    health_worker                   boolean,
    pregnancy_status_code           varchar(30) REFERENCES pregnancy_statuses(code),
    height_cm                       numeric(6,2),
    weight_kg                       numeric(6,2),

    bcg_status_code                 varchar(30) REFERENCES bcg_statuses(code),
    previous_treatment_category_code varchar(80)
                                    REFERENCES previous_treatment_categories(code),
    hiv_status_code                 varchar(30) REFERENCES hiv_statuses(code),
    dm_status_code                  varchar(30) REFERENCES dm_statuses(code),
    icd10_code                      varchar(20),

    confirmed_at                    timestamptz,
    closed_at                       timestamptz,

    status                          varchar(30) NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN (
                                        'ACTIVE',
                                        'REFERRED',
                                        'TRANSFERRED',
                                        'COMPLETED',
                                        'CLOSED',
                                        'CANCELLED'
                                    )),

    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_tb_case_height
        CHECK (height_cm IS NULL OR height_cm > 0),
    CONSTRAINT chk_tb_case_weight
        CHECK (weight_kg IS NULL OR weight_kg > 0),
    CONSTRAINT chk_tb_case_closed_at
        CHECK (closed_at IS NULL OR confirmed_at IS NULL OR closed_at >= confirmed_at)
);

CREATE INDEX idx_tb_cases_facility_status
    ON tb_cases(current_facility_id, status);

CREATE INDEX idx_tb_cases_category_status
    ON tb_cases(case_category_code, status);

-- ============================================================
-- Laboratory
-- ============================================================

CREATE TABLE lab_requests (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    registration_id         uuid REFERENCES tb_registrations(id),
    case_id                 uuid REFERENCES tb_cases(id),

    requesting_facility_id  uuid NOT NULL REFERENCES facilities(id),
    testing_facility_id     uuid NOT NULL REFERENCES facilities(id),

    request_reason_code     varchar(40) REFERENCES lab_request_reasons(code),

    referral_type           varchar(20) NOT NULL
                            CHECK (referral_type IN ('INTERNAL','EXTERNAL')),

    requested_at            timestamptz NOT NULL,
    sample_shipping_method  varchar(100),
    courier_name            varchar(150),

    status                  varchar(30) NOT NULL DEFAULT 'REQUESTED'
                            CHECK (status IN (
                                'DRAFT',
                                'REQUESTED',
                                'SENT',
                                'RECEIVED',
                                'PARTIAL',
                                'COMPLETED',
                                'CANCELLED'
                            )),

    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_lab_request_owner
        CHECK (num_nonnulls(registration_id, case_id) = 1)
);

CREATE INDEX idx_lab_requests_registration
    ON lab_requests(registration_id, requested_at DESC);

CREATE INDEX idx_lab_requests_case
    ON lab_requests(case_id, requested_at DESC);

CREATE INDEX idx_lab_requests_testing_status
    ON lab_requests(testing_facility_id, status, requested_at);

CREATE TABLE lab_request_tests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_request_id      uuid NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
    test_type_code      varchar(60) NOT NULL REFERENCES lab_test_types(code),

    status              varchar(30) NOT NULL DEFAULT 'REQUESTED'
                        CHECK (status IN (
                            'REQUESTED',
                            'IN_PROGRESS',
                            'RESULT_AVAILABLE',
                            'CANCELLED'
                        )),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (lab_request_id, test_type_code)
);

CREATE TABLE lab_specimens (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_request_id          uuid NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,

    specimen_code           varchar(100),
    specimen_type           varchar(100),

    collected_at            timestamptz,
    sent_at                 timestamptz,
    received_at             timestamptz,

    condition_on_receipt    varchar(100),
    examination_possible    boolean,
    rejection_reason        text,

    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_lab_specimen_timeline
        CHECK (
            (sent_at IS NULL OR collected_at IS NULL OR sent_at >= collected_at)
            AND
            (received_at IS NULL OR sent_at IS NULL OR received_at >= sent_at)
        )
);

CREATE INDEX idx_lab_specimens_request
    ON lab_specimens(lab_request_id);

CREATE TABLE lab_results (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_request_test_id     uuid NOT NULL REFERENCES lab_request_tests(id),
    specimen_id             uuid REFERENCES lab_specimens(id),

    sequence_no             integer NOT NULL DEFAULT 1 CHECK (sequence_no > 0),
    tested_at               timestamptz,

    result_code             varchar(100),
    result_value            varchar(255),
    result_text             text,

    status                  varchar(30) NOT NULL DEFAULT 'FINAL'
                            CHECK (status IN (
                                'PRELIMINARY',
                                'FINAL',
                                'CORRECTED',
                                'CANCELLED'
                            )),

    verified_at             timestamptz,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_lab_result_sequence
    ON lab_results(
        lab_request_test_id,
        COALESCE(specimen_id, '00000000-0000-0000-0000-000000000000'::uuid),
        sequence_no
    );

CREATE INDEX idx_lab_results_test
    ON lab_results(lab_request_test_id, tested_at DESC);

-- ============================================================
-- Regimen / drug reference data
-- ============================================================

CREATE TABLE regimens (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    varchar(100) NOT NULL UNIQUE,
    name                    varchar(255) NOT NULL,

    regimen_kind            varchar(30) NOT NULL
                            CHECK (regimen_kind IN ('TB_TREATMENT','PREVENTIVE')),
    tb_case_category_code   varchar(30) REFERENCES tb_case_categories(code),

    description             text,
    effective_from          date,
    effective_until         date,
    active                  boolean NOT NULL DEFAULT true,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_regimen_effective_dates
        CHECK (
            effective_until IS NULL
            OR effective_from IS NULL
            OR effective_until >= effective_from
        )
);

CREATE TABLE drugs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            varchar(100) NOT NULL UNIQUE,
    name            varchar(255) NOT NULL,
    strength        varchar(100),
    dosage_form     varchar(100),
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE regimen_drugs (
    regimen_id      uuid NOT NULL REFERENCES regimens(id) ON DELETE CASCADE,
    drug_id         uuid NOT NULL REFERENCES drugs(id),

    phase           varchar(40),
    dose_text       varchar(255),
    frequency_text  varchar(255),
    sequence_no     integer NOT NULL DEFAULT 1,

    PRIMARY KEY (regimen_id, drug_id, sequence_no)
);

-- ============================================================
-- Treatment
-- ============================================================

CREATE TABLE treatments (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                 uuid NOT NULL REFERENCES tb_cases(id),
    facility_id             uuid NOT NULL REFERENCES facilities(id),

    regimen_id              uuid REFERENCES regimens(id),
    regimen_description     text,

    start_date              date NOT NULL,
    planned_end_date        date,
    actual_end_date         date,

    initial_weight_kg       numeric(6,2),
    oat_form                varchar(100),
    drug_source             varchar(100),

    intensive_start_date    date,
    intensive_end_date      date,
    continuation_start_date date,
    continuation_end_date   date,

    status                  varchar(30) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN (
                                'PLANNED',
                                'ACTIVE',
                                'PAUSED',
                                'TRANSFERRED',
                                'COMPLETED',
                                'STOPPED',
                                'CANCELLED'
                            )),

    notes                   text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_treatment_dates
        CHECK (
            (planned_end_date IS NULL OR planned_end_date >= start_date)
            AND
            (actual_end_date IS NULL OR actual_end_date >= start_date)
            AND
            (intensive_end_date IS NULL OR intensive_start_date IS NULL
             OR intensive_end_date >= intensive_start_date)
            AND
            (continuation_end_date IS NULL OR continuation_start_date IS NULL
             OR continuation_end_date >= continuation_start_date)
        ),
    CONSTRAINT chk_treatment_weight
        CHECK (initial_weight_kg IS NULL OR initial_weight_kg > 0)
);

CREATE UNIQUE INDEX uq_treatments_one_open_per_case
    ON treatments(case_id)
    WHERE status IN ('PLANNED','ACTIVE','PAUSED');

CREATE INDEX idx_treatments_case
    ON treatments(case_id, start_date DESC);

CREATE INDEX idx_treatments_facility_status
    ON treatments(facility_id, status);

CREATE TABLE treatment_drugs (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id            uuid NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
    drug_id                 uuid REFERENCES drugs(id),

    drug_name_snapshot      varchar(255),
    treatment_phase         varchar(40),

    dose_value              numeric(10,3),
    dose_unit               varchar(30),
    frequency_per_week      integer CHECK (
                                frequency_per_week IS NULL
                                OR frequency_per_week BETWEEN 1 AND 7
                            ),

    start_date              date,
    end_date                date,

    batch_number            varchar(100),
    drug_source             varchar(100),
    notes                   text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_treatment_drug_name
        CHECK (drug_id IS NOT NULL OR drug_name_snapshot IS NOT NULL),
    CONSTRAINT chk_treatment_drug_dates
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_treatment_drugs_treatment
    ON treatment_drugs(treatment_id);

CREATE TABLE dose_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id            uuid NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,

    scheduled_date          date NOT NULL,
    recorded_at             timestamptz,

    status                  varchar(40) NOT NULL
                            CHECK (status IN (
                                'TAKEN_OBSERVED',
                                'TAKEN_SELF_REPORTED',
                                'DISPENSED_HOME',
                                'MISSED',
                                'UNKNOWN'
                            )),

    administration_mode     varchar(40)
                            CHECK (administration_mode IS NULL OR
                                   administration_mode IN (
                                       'DIRECTLY_OBSERVED',
                                       'SELF_ADMINISTERED',
                                       'OTHER'
                                   )),

    source                  varchar(40) NOT NULL DEFAULT 'TBCALL'
                            CHECK (source IN (
                                'SITB',
                                'PATIENT',
                                'HEALTH_WORKER',
                                'TBCALL',
                                'IMPORT'
                            )),

    recorded_by_user_id     uuid REFERENCES users(id),
    notes                   text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    UNIQUE (treatment_id, scheduled_date)
);

CREATE INDEX idx_dose_events_treatment_date
    ON dose_events(treatment_id, scheduled_date DESC);

CREATE INDEX idx_dose_events_status_date
    ON dose_events(status, scheduled_date);

CREATE TABLE follow_ups (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id        uuid NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,

    follow_up_type      varchar(80) NOT NULL,
    scheduled_at        timestamptz NOT NULL,
    completed_at        timestamptz,

    facility_id         uuid REFERENCES facilities(id),
    health_worker_id    uuid REFERENCES users(id),

    status              varchar(30) NOT NULL DEFAULT 'SCHEDULED'
                        CHECK (status IN (
                            'SCHEDULED',
                            'COMPLETED',
                            'MISSED',
                            'CANCELLED'
                        )),

    notes               text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_follow_up_completed_at
        CHECK (completed_at IS NULL OR completed_at >= scheduled_at)
);

CREATE INDEX idx_follow_ups_due
    ON follow_ups(status, scheduled_at);

CREATE TABLE treatment_outcomes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id        uuid NOT NULL UNIQUE REFERENCES treatments(id) ON DELETE CASCADE,
    outcome_code        varchar(60) NOT NULL REFERENCES treatment_outcome_codes(code),
    outcome_date        date NOT NULL,
    notes               text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PMO / companion / patient support
-- ============================================================

CREATE TABLE patient_supporters (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             uuid NOT NULL REFERENCES tb_cases(id) ON DELETE CASCADE,

    supporter_type      varchar(30) NOT NULL
                        CHECK (supporter_type IN ('PMO','COMPANION')),

    supporter_status    varchar(80),
    full_name           varchar(255) NOT NULL,
    address             text,
    phone               varchar(30),
    organization_name   varchar(255),

    linked_user_id      uuid REFERENCES users(id),
    notes               text,

    active              boolean NOT NULL DEFAULT true,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_supporters_case
    ON patient_supporters(case_id, supporter_type, active);

-- ============================================================
-- Referral / transfer continuity of care
-- ============================================================

CREATE TABLE referrals (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                 uuid NOT NULL REFERENCES tb_cases(id),
    treatment_id            uuid REFERENCES treatments(id),

    referral_type           varchar(40) NOT NULL
                            CHECK (referral_type IN (
                                'PRE_TREATMENT_REFERRAL',
                                'TREATMENT_TRANSFER'
                            )),

    source_facility_id      uuid NOT NULL REFERENCES facilities(id),
    destination_facility_id uuid NOT NULL REFERENCES facilities(id),

    sent_at                 timestamptz NOT NULL,
    received_at             timestamptz,
    patient_reported_at     timestamptz,

    status                  varchar(30) NOT NULL DEFAULT 'SENT'
                            CHECK (status IN (
                                'DRAFT',
                                'SENT',
                                'RECEIVED',
                                'REPORTED',
                                'CANCELLED',
                                'RETURNED'
                            )),

    cancelled_at            timestamptz,
    cancel_reason           text,
    notes                   text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_referral_facilities
        CHECK (source_facility_id <> destination_facility_id),
    CONSTRAINT chk_referral_timeline
        CHECK (
            (received_at IS NULL OR received_at >= sent_at)
            AND
            (patient_reported_at IS NULL OR patient_reported_at >= sent_at)
            AND
            (cancelled_at IS NULL OR cancelled_at >= sent_at)
        )
);

CREATE INDEX idx_referrals_case
    ON referrals(case_id, sent_at DESC);

CREATE INDEX idx_referrals_destination_status
    ON referrals(destination_facility_id, status, sent_at);

-- ============================================================
-- Contact investigation
-- ============================================================

CREATE TABLE contacts (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    index_case_id               uuid NOT NULL REFERENCES tb_cases(id) ON DELETE CASCADE,
    linked_patient_id           uuid REFERENCES patients(id),

    full_name                   varchar(255) NOT NULL,
    birth_date                  date,
    sex_code                    varchar(30) REFERENCES sex_codes(code),
    phone                       varchar(30),
    address                     text,

    relationship_to_index_case  varchar(100),
    household_contact           boolean,

    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_index_case
    ON contacts(index_case_id);

CREATE TABLE contact_investigations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id              uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

    workflow_type           varchar(30) NOT NULL
                            CHECK (workflow_type IN (
                                'INTERNAL',
                                'INCOMING_REFERRAL',
                                'OUTGOING_REFERRAL'
                            )),

    source_facility_id      uuid REFERENCES facilities(id),
    destination_facility_id uuid REFERENCES facilities(id),

    requested_at            timestamptz,
    received_at             timestamptz,
    investigated_at         timestamptz,

    status                  varchar(30) NOT NULL DEFAULT 'NEW'
                            CHECK (status IN (
                                'NEW',
                                'SENT',
                                'RECEIVED',
                                'IN_PROGRESS',
                                'COMPLETED',
                                'RETURNED',
                                'CANCELLED'
                            )),

    result_code             varchar(100),
    return_reason           text,
    notes                   text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_investigations_contact
    ON contact_investigations(contact_id, status);

CREATE INDEX idx_contact_investigations_destination
    ON contact_investigations(destination_facility_id, status);

-- ============================================================
-- Preventive treatment (TPT)
-- ============================================================

CREATE TABLE preventive_treatments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    contact_id          uuid REFERENCES contacts(id),
    patient_id          uuid REFERENCES patients(id),
    index_case_id       uuid REFERENCES tb_cases(id),

    facility_id         uuid NOT NULL REFERENCES facilities(id),
    regimen_id          uuid REFERENCES regimens(id),

    start_date          date NOT NULL,
    planned_end_date    date,
    actual_end_date     date,

    duration_value      integer CHECK (duration_value IS NULL OR duration_value > 0),
    duration_unit       varchar(20)
                        CHECK (duration_unit IS NULL OR
                               duration_unit IN ('DAY','WEEK','MONTH')),

    weight_kg           numeric(6,2),
    drug_source         varchar(100),

    status              varchar(30) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN (
                            'PLANNED',
                            'ACTIVE',
                            'COMPLETED',
                            'STOPPED',
                            'LOST_TO_FOLLOW_UP',
                            'CANCELLED'
                        )),

    outcome_code        varchar(100),
    notes               text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_preventive_treatment_person
        CHECK (num_nonnulls(contact_id, patient_id) = 1),
    CONSTRAINT chk_preventive_treatment_dates
        CHECK (
            (planned_end_date IS NULL OR planned_end_date >= start_date)
            AND
            (actual_end_date IS NULL OR actual_end_date >= start_date)
        ),
    CONSTRAINT chk_preventive_treatment_weight
        CHECK (weight_kg IS NULL OR weight_kg > 0)
);

CREATE INDEX idx_preventive_treatment_contact
    ON preventive_treatments(contact_id);

CREATE INDEX idx_preventive_treatment_patient
    ON preventive_treatments(patient_id);

-- ============================================================
-- Adverse event / MESO-aligned monitoring
-- ============================================================

CREATE TABLE adverse_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id        uuid NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,

    reported_at         timestamptz NOT NULL DEFAULT now(),
    event_type          varchar(150) NOT NULL,
    severity            varchar(50),

    serious             boolean NOT NULL DEFAULT false,

    started_at          timestamptz,
    ended_at            timestamptz,

    description         text,
    action_taken        text,
    outcome             text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_adverse_event_dates
        CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_adverse_events_treatment
    ON adverse_events(treatment_id, reported_at DESC);

-- ============================================================
-- TBCall-owned monitoring
-- ============================================================

CREATE TABLE monitoring_plans (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id        uuid NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,

    status              varchar(30) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','CANCELLED')),

    start_date          date NOT NULL,
    end_date            date,

    rules_version       varchar(50),
    notes               text,

    created_by_user_id  uuid REFERENCES users(id),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_monitoring_plan_dates
        CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX uq_monitoring_plan_active_treatment
    ON monitoring_plans(treatment_id)
    WHERE status = 'ACTIVE';

CREATE TABLE monitoring_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    monitoring_plan_id  uuid NOT NULL REFERENCES monitoring_plans(id) ON DELETE CASCADE,

    event_type          varchar(80) NOT NULL,
    scheduled_at        timestamptz NOT NULL,
    due_at              timestamptz,
    completed_at        timestamptz,

    status              varchar(30) NOT NULL DEFAULT 'SCHEDULED'
                        CHECK (status IN (
                            'SCHEDULED',
                            'DUE',
                            'OVERDUE',
                            'COMPLETED',
                            'CANCELLED'
                        )),

    source_entity_type  varchar(80),
    source_entity_id    uuid,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_monitoring_event_due
        CHECK (due_at IS NULL OR due_at >= scheduled_at),
    CONSTRAINT chk_monitoring_event_completed
        CHECK (completed_at IS NULL OR completed_at >= scheduled_at)
);

CREATE INDEX idx_monitoring_events_due
    ON monitoring_events(status, due_at);

CREATE TABLE alerts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    patient_id          uuid NOT NULL REFERENCES patients(id),
    case_id             uuid REFERENCES tb_cases(id),
    treatment_id        uuid REFERENCES treatments(id),
    monitoring_event_id uuid REFERENCES monitoring_events(id),

    alert_type          varchar(80) NOT NULL,
    severity            varchar(20) NOT NULL DEFAULT 'INFO'
                        CHECK (severity IN ('INFO','WARNING','HIGH','CRITICAL')),

    status              varchar(30) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN (
                            'OPEN',
                            'ACKNOWLEDGED',
                            'RESOLVED',
                            'DISMISSED'
                        )),

    triggered_at        timestamptz NOT NULL DEFAULT now(),
    due_at              timestamptz,
    acknowledged_at     timestamptz,
    resolved_at         timestamptz,

    rule_code           varchar(100),
    message             text NOT NULL,
    details             jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_patient_status
    ON alerts(patient_id, status, triggered_at DESC);

CREATE INDEX idx_alerts_open_due
    ON alerts(status, due_at)
    WHERE status IN ('OPEN','ACKNOWLEDGED');

CREATE TABLE notifications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id            uuid REFERENCES alerts(id) ON DELETE SET NULL,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    channel             varchar(30) NOT NULL
                        CHECK (channel IN (
                            'IN_APP',
                            'EMAIL',
                            'SMS',
                            'WHATSAPP',
                            'PUSH'
                        )),

    status              varchar(30) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN (
                            'PENDING',
                            'SENT',
                            'DELIVERED',
                            'READ',
                            'FAILED',
                            'CANCELLED'
                        )),

    scheduled_at        timestamptz NOT NULL DEFAULT now(),
    sent_at             timestamptz,
    delivered_at        timestamptz,
    read_at             timestamptz,

    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    failure_reason      text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user
    ON notifications(user_id, status, scheduled_at DESC);

CREATE INDEX idx_notifications_pending
    ON notifications(status, scheduled_at)
    WHERE status = 'PENDING';

-- ============================================================
-- External systems / future SITB integration
-- ============================================================

CREATE TABLE external_systems (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                varchar(60) NOT NULL UNIQUE,
    name                varchar(150) NOT NULL,
    description         text,
    active              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE external_identifiers (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id  uuid NOT NULL REFERENCES external_systems(id),

    entity_type         varchar(80) NOT NULL,
    entity_id           uuid NOT NULL,

    external_id         varchar(255) NOT NULL,
    external_version    varchar(100),

    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (external_system_id, entity_type, external_id),
    UNIQUE (external_system_id, entity_type, entity_id)
);

CREATE INDEX idx_external_identifiers_entity
    ON external_identifiers(entity_type, entity_id);

CREATE TABLE sync_runs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id  uuid NOT NULL REFERENCES external_systems(id),

    direction           varchar(20) NOT NULL DEFAULT 'INBOUND'
                        CHECK (direction IN ('INBOUND','OUTBOUND')),

    status              varchar(30) NOT NULL DEFAULT 'RUNNING'
                        CHECK (status IN (
                            'RUNNING',
                            'SUCCEEDED',
                            'PARTIAL',
                            'FAILED',
                            'CANCELLED'
                        )),

    started_at          timestamptz NOT NULL DEFAULT now(),
    finished_at         timestamptz,

    records_received    integer NOT NULL DEFAULT 0 CHECK (records_received >= 0),
    records_created     integer NOT NULL DEFAULT 0 CHECK (records_created >= 0),
    records_updated     integer NOT NULL DEFAULT 0 CHECK (records_updated >= 0),
    records_failed      integer NOT NULL DEFAULT 0 CHECK (records_failed >= 0),

    cursor_value        text,
    error_message       text,

    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_sync_run_finished
        CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX idx_sync_runs_system_started
    ON sync_runs(external_system_id, started_at DESC);

CREATE TABLE sync_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_run_id         uuid NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,

    entity_type         varchar(80) NOT NULL,
    external_id         varchar(255) NOT NULL,
    resolved_entity_id  uuid,

    operation           varchar(30) NOT NULL
                        CHECK (operation IN (
                            'CREATE',
                            'UPDATE',
                            'UPSERT',
                            'DELETE',
                            'IGNORE'
                        )),

    status              varchar(30) NOT NULL
                        CHECK (status IN (
                            'PENDING',
                            'SUCCEEDED',
                            'FAILED',
                            'SKIPPED'
                        )),

    source_updated_at   timestamptz,
    content_hash        varchar(128),
    raw_payload         jsonb,

    error_message       text,
    processed_at        timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_items_run_status
    ON sync_items(sync_run_id, status);

CREATE INDEX idx_sync_items_external
    ON sync_items(entity_type, external_id);

-- ============================================================
-- Audit
-- ============================================================

CREATE TABLE audit_logs (
    id                  bigserial PRIMARY KEY,

    actor_user_id       uuid REFERENCES users(id),
    action              varchar(100) NOT NULL,

    entity_type         varchar(80) NOT NULL,
    entity_id           uuid,

    occurred_at         timestamptz NOT NULL DEFAULT now(),

    request_id          varchar(100),
    ip_address          inet,
    user_agent          text,

    before_data         jsonb,
    after_data          jsonb,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_audit_logs_entity
    ON audit_logs(entity_type, entity_id, occurred_at DESC);

CREATE INDEX idx_audit_logs_actor
    ON audit_logs(actor_user_id, occurred_at DESC);

-- ============================================================
-- updated_at triggers
-- ============================================================

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'facilities',
        'users',
        'patients',
        'patient_user_links',
        'tb_registrations',
        'diagnoses',
        'tb_cases',
        'lab_requests',
        'lab_request_tests',
        'lab_specimens',
        'lab_results',
        'regimens',
        'drugs',
        'treatments',
        'treatment_drugs',
        'dose_events',
        'follow_ups',
        'treatment_outcomes',
        'patient_supporters',
        'referrals',
        'contacts',
        'contact_investigations',
        'preventive_treatments',
        'adverse_events',
        'monitoring_plans',
        'monitoring_events',
        'alerts',
        'notifications',
        'external_systems',
        'external_identifiers'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            'trg_' || t || '_updated_at',
            t
        );
    END LOOP;
END;
$$;

COMMIT;
