-- ============================================================
-- TBCall Complete Dummy Data Generator (FIXED)
-- PostgreSQL 15+
-- WARNING: FOR TESTING/DEVELOPMENT ONLY!
-- ============================================================
ROLLBACK;
BEGIN;

-- ============================================================
-- Helper Functions
-- ============================================================
CREATE OR REPLACE FUNCTION random_date_between(start_date date, end_date date)
RETURNS date AS $$ BEGIN
    RETURN start_date + floor(random() * (end_date - start_date + 1))::int;
END;
 $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION random_ts_between(start_ts timestamptz, end_ts timestamptz)
RETURNS timestamptz AS $$ BEGIN
    RETURN start_ts + random() * (end_ts - start_ts);
END;
 $$ LANGUAGE plpgsql;

-- ============================================================
-- 1. FACILITIES (1000 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Facilities...'; END $$;

INSERT INTO facilities (
    id, facility_type_code, parent_facility_id, name, address,
    province_code, regency_code, district_code, village_code, postal_code,
    latitude, longitude, active, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    (ARRAY['PUSKESMAS','RUMAH_SAKIT','KLINIK','BALAI_PENGOBATAN','BP4_BBKPM_BKPM','LAPAS_RUTAN','PRAKTEK_DOKTER_MANDIRI'])[1 + floor(random() * 7)::int],
    NULL,
    CASE floor(random() * 7)::int
        WHEN 0 THEN 'Puskesmas ' || n
        WHEN 1 THEN 'RSUD ' || n
        WHEN 2 THEN 'Klinik TB ' || n
        WHEN 3 THEN 'BP ' || n
        WHEN 4 THEN 'BBKPM ' || n
        WHEN 5 THEN 'Lapas ' || n
        ELSE 'Praktek Dr. ' || n
    END,
    'Jl. ' || (ARRAY['Merdeka','Sudirman','Gatot Subroto','Asia Afrika','Diponegoro','Ahmad Yani','Thamrin'])[1 + floor(random() * 7)::int] 
        || ' No. ' || (1 + floor(random() * 500)::int),
    '3' || (1 + floor(random() * 6)::int),
    '3' || (1 + floor(random() * 6)::int) || lpad((1 + floor(random() * 20)::int)::text, 2, '0'),
    '3' || (1 + floor(random() * 6)::int) || lpad((1 + floor(random() * 20)::int)::text, 2, '0') || lpad((1 + floor(random() * 30)::int)::text, 2, '0'),
    '3' || (1 + floor(random() * 6)::int) || lpad((1 + floor(random() * 20)::int)::text, 2, '0') || lpad((1 + floor(random() * 30)::int)::text, 2, '0') || lpad((1 + floor(random() * 50)::int)::text, 3, '0'),
    (10000 + floor(random() * 70000)::int)::text,
    -6.0 + random() * 5,
    106.0 + random() * 20,
    random() < 0.95,
    random_ts_between('2020-01-01'::timestamptz, now()),
    random_ts_between('2020-01-01'::timestamptz, now())
FROM generate_series(1, 1000) AS n;

-- ============================================================
-- 2. USERS (1000 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Users...'; END $$;

INSERT INTO users (
    id, email, phone, password_hash, status,
    email_verified_at, phone_verified_at, last_login_at,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    'user' || n || '@tbcall.test',
    '08' || lpad(floor(random() * 10000000000)::bigint::text, 10, '0'),
    '$2a$10$' || encode(gen_random_bytes(16), 'base64'),
    (ARRAY['PENDING','ACTIVE','SUSPENDED','DISABLED'])[
        CASE WHEN random() < 0.80 THEN 2 WHEN random() < 0.90 THEN 1 WHEN random() < 0.97 THEN 3 ELSE 4 END
    ],
    CASE WHEN random() < 0.85 THEN random_ts_between('2020-01-01'::timestamptz, now()) ELSE NULL END,
    CASE WHEN random() < 0.70 THEN random_ts_between('2020-01-01'::timestamptz, now()) ELSE NULL END,
    CASE WHEN random() < 0.60 THEN random_ts_between('2023-01-01'::timestamptz, now()) ELSE NULL END,
    random_ts_between('2020-01-01'::timestamptz, now()),
    random_ts_between('2020-01-01'::timestamptz, now())
FROM generate_series(1, 1000) AS n;

-- ============================================================
-- 3. USER-FACILITY LINKS
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating User-Facility Links...'; END $$;

WITH user_facility_pairs AS (
    SELECT 
        u.id AS user_id,
        f.id AS facility_id,
        ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY random()) AS rn
    FROM users u
    CROSS JOIN LATERAL (
        SELECT id FROM facilities ORDER BY random() LIMIT (1 + floor(random() * 3)::int)
    ) f
)
INSERT INTO user_facilities (user_id, facility_id, is_primary, active, assigned_at)
SELECT 
    user_id,
    facility_id,
    rn = 1,
    true,
    random_ts_between('2020-01-01'::timestamptz, now())
FROM user_facility_pairs;

-- ============================================================
-- 4. USER-ROLE LINKS
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating User-Role Links...'; END $$;

WITH user_role_pairs AS (
    SELECT DISTINCT
        u.id AS user_id,
        r.id AS role_id
    FROM users u
    CROSS JOIN LATERAL (
        SELECT id FROM roles ORDER BY random() LIMIT (1 + floor(random() * 2)::int)
    ) r
)
INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
SELECT 
    user_id,
    role_id,
    random_ts_between('2020-01-01'::timestamptz, now()),
    NULL
FROM user_role_pairs;

-- ============================================================
-- 5. PATIENTS (1000 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Patients...'; END $$;

INSERT INTO patients (
    id, nik, other_identity_number, bpjs_number, full_name,
    citizenship, birth_place, birth_date, birth_date_unknown, sex_code,
    phone, address, province_code, regency_code, district_code, village_code,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    CASE WHEN random() < 0.85 THEN
        '3' || (1 + floor(random() * 6)::int) || 
        lpad((1 + floor(random() * 12)::int)::text, 2, '0') ||
        lpad((1 + floor(random() * 31)::int)::text, 2, '0') ||
        lpad(floor(random() * 1000000000)::bigint::text, 10, '0')
    ELSE NULL END,
    CASE WHEN random() < 0.20 THEN 'PASS' || lpad(n::text, 8, '0') ELSE NULL END,
    CASE WHEN random() < 0.70 THEN lpad(floor(random() * 10000000000000)::bigint::text, 13, '0') ELSE NULL END,
    (ARRAY['Ahmad','Budi','Candra','Dedi','Eko','Fajar','Gunawan','Hadi','Iman','Joko','Siti','Ratna','Putri','Nurul','Maya','Lina','Kartika','Indah','Dewi','Ayu'])[1 + floor(random() * 20)::int] 
        || ' ' ||
    (ARRAY['Santoso','Wijaya','Susanto','Prabowo','Setiawan','Hidayat','Rahman','Abdullah','Saputra','Kusuma','Pratiwi','Wulandari','Anggraini','Lestari','Rahayu','Handayani','Safitri','Utami','Permatasari','Ningsih'])[1 + floor(random() * 20)::int],
    'Indonesia',
    (ARRAY['Jakarta','Bandung','Surabaya','Medan','Makassar','Semarang','Palembang','Yogyakarta','Malang','Solo'])[1 + floor(random() * 10)::int],
    random_date_between('1940-01-01'::date, '2020-12-31'::date),
    random() < 0.05,
    (ARRAY['LAKI_LAKI','PEREMPUAN'])[1 + floor(random() * 2)::int],
    CASE WHEN random() < 0.80 THEN '08' || lpad(floor(random() * 10000000000)::bigint::text, 10, '0') ELSE NULL END,
    'Jl. ' || (ARRAY['Mawar','Melati','Anggrek','Kenanga','Dahlia','Cempaka','Teratai','Flamboyan'])[1 + floor(random() * 8)::int] 
        || ' No. ' || (1 + floor(random() * 200)::int)
        || ', RT ' || lpad((1 + floor(random() * 20)::int)::text, 3, '0')
        || '/RW ' || lpad((1 + floor(random() * 15)::int)::text, 3, '0'),
    '3' || (1 + floor(random() * 6)::int),
    '3' || (1 + floor(random() * 6)::int) || lpad((1 + floor(random() * 20)::int)::text, 2, '0'),
    '3' || (1 + floor(random() * 6)::int) || lpad((1 + floor(random() * 20)::int)::text, 2, '0') || lpad((1 + floor(random() * 30)::int)::text, 2, '0'),
    '3' || (1 + floor(random() * 6)::int) || lpad((1 + floor(random() * 20)::int)::text, 2, '0') || lpad((1 + floor(random() * 30)::int)::text, 2, '0') || lpad((1 + floor(random() * 50)::int)::text, 3, '0'),
    random_ts_between('2020-01-01'::timestamptz, now()),
    random_ts_between('2020-01-01'::timestamptz, now())
FROM generate_series(1, 1000) AS n;

-- ============================================================
-- 6. PATIENT-USER LINKS
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Patient-User Links...'; END $$;

WITH active_users AS (
    SELECT 
        id AS user_id,
        ROW_NUMBER() OVER (ORDER BY random()) AS rn
    FROM users
    WHERE status = 'ACTIVE'
),
selected_patients AS (
    SELECT 
        id AS patient_id,
        ROW_NUMBER() OVER (ORDER BY random()) AS rn
    FROM patients
    WHERE random() < 0.30
),
link_data AS (
    SELECT
        au.user_id,
        sp.patient_id,
        (ARRAY['SELF','SPOUSE','PARENT','CHILD','SIBLING','GUARDIAN'])[1 + floor(random() * 6)::int] AS relationship_type,
        (ARRAY['PENDING','VERIFIED','REJECTED','REVOKED'])[
            CASE WHEN random() < 0.75 THEN 2 WHEN random() < 0.85 THEN 1 WHEN random() < 0.95 THEN 3 ELSE 4 END
        ] AS verification_status
    FROM selected_patients sp
    JOIN active_users au ON sp.rn = au.rn
    LIMIT 300
)
INSERT INTO patient_user_links (
    id, user_id, patient_id, relationship_type, verification_status,
    verified_at, verified_by, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    user_id,
    patient_id,
    relationship_type,
    verification_status,
    CASE WHEN verification_status = 'VERIFIED'
         THEN random_ts_between('2020-01-01'::timestamptz, now())
         ELSE NULL END,
    NULL,
    random_ts_between('2020-01-01'::timestamptz, now()),
    random_ts_between('2020-01-01'::timestamptz, now())
FROM link_data;

-- ============================================================
-- 7. TB REGISTRATIONS (1000 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating TB Registrations...'; END $$;

INSERT INTO tb_registrations (
    id, patient_id, facility_id, registration_date,
    facility_registration_number, medical_record_number, specimen_identity_number,
    suspect_type_code, previous_treatment_category_code,
    referred_by_type, referred_by_reference, referral_notes,
    initial_weight_kg, hiv_status_code, dm_status_code, status,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    p.id,
    f.id,
    reg_date,
    'REG-' || SUBSTRING(f.name, 1, 10) || '-' || n || '-' || EXTRACT(YEAR FROM reg_date),
    'MR-' || lpad(n::text, 8, '0'),
    CASE WHEN random() < 0.70 THEN 'SPEC-' || lpad(n::text, 10, '0') ELSE NULL END,
    (ARRAY['TB_SO', 'TB_RO'])[CASE WHEN random() < 0.90 THEN 1 ELSE 2 END],
    (SELECT code FROM previous_treatment_categories ORDER BY random() LIMIT 1),
    CASE 
        WHEN random() < 0.30 THEN 'PUSKESMAS'
        WHEN random() < 0.60 THEN 'RUMAH_SAKIT'
        WHEN random() < 0.80 THEN 'SELF'
        ELSE 'OTHER'
    END,
    CASE WHEN random() < 0.50 THEN 'Rujukan dari ' || (ARRAY['Puskesmas A', 'RSUD B', 'Klinik C'])[1 + floor(random() * 3)::int] ELSE NULL END,
    CASE WHEN random() < 0.30 THEN 'Pasien mengeluh batuk > 2 minggu, demam, keringat malam' ELSE NULL END,
    30 + random() * 80,
    (SELECT code FROM hiv_statuses ORDER BY random() LIMIT 1),
    (SELECT code FROM dm_statuses ORDER BY random() LIMIT 1),
    (ARRAY['OPEN', 'DIAGNOSED', 'CONVERTED_TO_CASE', 'CLOSED', 'CANCELLED'])[
        CASE WHEN random() < 0.15 THEN 1 WHEN random() < 0.30 THEN 2 WHEN random() < 0.65 THEN 3 WHEN random() < 0.90 THEN 4 ELSE 5 END
    ],
    reg_date::timestamptz,
    reg_date::timestamptz + (random() * interval '30 days')
FROM generate_series(1, 1000) AS n
CROSS JOIN LATERAL (SELECT random_date_between('2020-01-01'::date, CURRENT_DATE) AS reg_date) d
CROSS JOIN LATERAL (SELECT id FROM patients ORDER BY random() LIMIT 1) p
CROSS JOIN LATERAL (SELECT id, name FROM facilities ORDER BY random() LIMIT 1) f;

-- ============================================================
-- 8. DIAGNOSES (800 records) - FIXED: disposition konsisten dengan referral target
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Diagnoses...'; END $$;

WITH diag_source AS (
    SELECT
        r.id AS registration_id,
        r.registration_date,
        CASE
            WHEN random() < 0.70 THEN 'TREAT_HERE'
            WHEN random() < 0.85 THEN 'REFERRED'
            WHEN random() < 0.95 THEN 'NOT_TREATED'
            ELSE 'UNKNOWN'
        END AS treatment_disposition,
        (SELECT id FROM facilities ORDER BY random() LIMIT 1) AS referral_facility_id,
        -- tanggal diagnosis ditentukan sekali
        r.registration_date + (random() * 30)::int AS dx_date
    FROM tb_registrations r
    WHERE random() < 0.80
    ORDER BY random()
    LIMIT 800
)
INSERT INTO diagnoses (
    id, registration_id, diagnosis_date, anatomical_site_code, diagnosis_type_code,
    diagnosis_result, chest_xray_result, chest_xray_date, chest_xray_serial,
    chest_xray_impression, icd10_code, treatment_disposition,
    referred_to_facility_id, notes, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    ds.registration_id,
    ds.dx_date,
    (SELECT code FROM anatomical_sites ORDER BY random() LIMIT 1),
    (SELECT code FROM diagnosis_types ORDER BY random() LIMIT 1),
    CASE 
        WHEN random() < 0.33 THEN 'BTA Positif'
        WHEN random() < 0.66 THEN 'TCM MTB Detected'
        ELSE 'Diagnosis Klinis'
    END,
    CASE WHEN random() < 0.80 THEN (ARRAY['Normal', 'Infiltrat', 'Kavitas', 'Efusi Pleura', 'TB Milier'])[1 + floor(random() * 5)::int] ELSE NULL END,
    -- tanggal xray setelah diagnosis atau sebelumnya (pemeriksaan pendukung), konsisten
    CASE WHEN random() < 0.80 THEN ds.dx_date - (random() * 15)::int ELSE NULL END,
    CASE WHEN random() < 0.80 THEN 'XR-' || lpad((random() * 100000)::int::text, 8, '0') ELSE NULL END,
    CASE WHEN random() < 0.50 THEN 'Cor pulmo dalam batas normal. Tampak infiltrat.' ELSE NULL END,
    (ARRAY['A15.0', 'A15.1', 'A15.2', 'A15.3', 'A16.0', 'A16.2', 'A17.0', 'A18.0', 'A19.0'])[1 + floor(random() * 9)::int],
    ds.treatment_disposition,
    CASE WHEN ds.treatment_disposition = 'REFERRED' THEN ds.referral_facility_id ELSE NULL END,
    CASE WHEN random() < 0.40 THEN 'Pasien kooperatif, akan mulai pengobatan TB' ELSE NULL END,
    ds.dx_date::timestamptz,
    ds.dx_date::timestamptz + (random() * interval '7 days')
FROM diag_source ds;

-- ============================================================
-- 9. TB CASES (600 records) - FIXED: closed_at konsisten dengan status & setelah confirmed_at
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating TB Cases...'; END $$;

WITH case_source AS (
    SELECT
        r.id AS registration_id,
        r.facility_id,
        d.id AS diagnosis_id,
        d.diagnosis_date,
        p.sex_code,
        CASE
            WHEN random() < 0.35 THEN 'ACTIVE'
            WHEN random() < 0.40 THEN 'REFERRED'
            WHEN random() < 0.45 THEN 'TRANSFERRED'
            WHEN random() < 0.70 THEN 'COMPLETED'
            WHEN random() < 0.90 THEN 'CLOSED'
            ELSE 'CANCELLED'
        END AS case_status,
        random_ts_between(d.diagnosis_date::timestamptz, now()) AS confirmed_at
    FROM tb_registrations r
    INNER JOIN diagnoses d ON d.registration_id = r.id
    INNER JOIN patients p ON p.id = r.patient_id
    WHERE r.status = 'CONVERTED_TO_CASE'
    ORDER BY random()
    LIMIT 600
)
INSERT INTO tb_cases (
    id, registration_id, confirming_diagnosis_id, current_facility_id,
    case_category_code, health_worker, pregnancy_status_code,
    height_cm, weight_kg, bcg_status_code, previous_treatment_category_code,
    hiv_status_code, dm_status_code, icd10_code, confirmed_at, closed_at,
    status, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    cs.registration_id,
    cs.diagnosis_id,
    cs.facility_id,
    (SELECT code FROM tb_case_categories ORDER BY random() LIMIT 1),
    random() < 0.05,
    CASE WHEN cs.sex_code = 'PEREMPUAN' THEN (SELECT code FROM pregnancy_statuses ORDER BY random() LIMIT 1) ELSE NULL END,
    140 + random() * 50,
    30 + random() * 80,
    (SELECT code FROM bcg_statuses ORDER BY random() LIMIT 1),
    (SELECT code FROM previous_treatment_categories ORDER BY random() LIMIT 1),
    (SELECT code FROM hiv_statuses ORDER BY random() LIMIT 1),
    (SELECT code FROM dm_statuses ORDER BY random() LIMIT 1),
    (ARRAY['A15.0', 'A15.1', 'A15.2', 'A15.3', 'A16.0', 'A16.2'])[1 + floor(random() * 6)::int],
    cs.confirmed_at,
    CASE WHEN cs.case_status IN ('COMPLETED', 'CLOSED', 'CANCELLED')
         THEN cs.confirmed_at + interval '180 days' + (random() * interval '180 days')
         ELSE NULL
    END,
    cs.case_status,
    cs.confirmed_at - (random() * interval '3 days'),
    cs.confirmed_at + (random() * interval '30 days')
FROM case_source cs;

-- ============================================================
-- 10. LAB REQUESTS (1000 records) - FIXED: XOR registration/case
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Lab Requests...'; END $$;

WITH lab_source AS (
    SELECT
        n,
        CASE WHEN random() < 0.60 THEN 'REGISTRATION' ELSE 'CASE' END AS owner_type,
        random_ts_between('2020-01-01'::timestamptz, now()) AS requested_at,
        (ARRAY['DRAFT', 'REQUESTED', 'SENT', 'RECEIVED', 'PARTIAL', 'COMPLETED', 'CANCELLED'])[
            CASE WHEN random() < 0.05 THEN 1 WHEN random() < 0.15 THEN 2 WHEN random() < 0.25 THEN 3 WHEN random() < 0.35 THEN 4 WHEN random() < 0.40 THEN 5 WHEN random() < 0.85 THEN 6 ELSE 7 END
        ] AS lr_status
    FROM generate_series(1, 1000) AS n
)
INSERT INTO lab_requests (
    id, registration_id, case_id, requesting_facility_id, testing_facility_id,
    request_reason_code, referral_type, requested_at, sample_shipping_method,
    courier_name, status, notes, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    CASE WHEN ls.owner_type = 'REGISTRATION' THEN r.id ELSE NULL END,
    CASE WHEN ls.owner_type = 'CASE' THEN c.id ELSE NULL END,
    f1.id,
    f2.id,
    (SELECT code FROM lab_request_reasons ORDER BY random() LIMIT 1),
    CASE WHEN f1.id = f2.id THEN 'INTERNAL' ELSE 'EXTERNAL' END,
    ls.requested_at,
    CASE WHEN ls.lr_status = 'DRAFT' THEN NULL
         ELSE (ARRAY['Kurir Internal', 'Pos', 'Kurir Ekspedisi', 'Dibawa Petugas', 'Dibawa Pasien'])[1 + floor(random() * 5)::int] END,
    CASE WHEN ls.lr_status NOT IN ('DRAFT') AND random() < 0.60 
         THEN (ARRAY['JNE', 'TIKI', 'SiCepat', 'Kurir Dinas'])[1 + floor(random() * 4)::int] 
         ELSE NULL END,
    ls.lr_status,
    CASE WHEN random() < 0.30 THEN 'Permintaan pemeriksaan lab untuk diagnosis TB' ELSE NULL END,
    ls.requested_at,
    ls.requested_at + (random() * interval '30 days')
FROM lab_source ls
CROSS JOIN LATERAL (SELECT id FROM tb_registrations ORDER BY random() LIMIT 1) r
CROSS JOIN LATERAL (SELECT id FROM tb_cases ORDER BY random() LIMIT 1) c
CROSS JOIN LATERAL (SELECT id FROM facilities ORDER BY random() LIMIT 1) f1
CROSS JOIN LATERAL (SELECT id FROM facilities ORDER BY random() LIMIT 1) f2;

-- ============================================================
-- 11. LAB REQUEST TESTS
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Lab Request Tests...'; END $$;

WITH lab_test_pairs AS (
    SELECT 
        lr.id AS lab_request_id,
        ltt.code AS test_type_code,
        ROW_NUMBER() OVER (PARTITION BY lr.id ORDER BY random()) AS rn
    FROM lab_requests lr
    CROSS JOIN LATERAL (
        SELECT code FROM lab_test_types ORDER BY random() LIMIT (1 + floor(random() * 3)::int)
    ) ltt
)
INSERT INTO lab_request_tests (
    id, lab_request_id, test_type_code, status, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    lab_request_id,
    test_type_code,
    (ARRAY['REQUESTED', 'IN_PROGRESS', 'RESULT_AVAILABLE', 'CANCELLED'])[
        CASE WHEN random() < 0.15 THEN 1 WHEN random() < 0.25 THEN 2 WHEN random() < 0.85 THEN 3 ELSE 4 END
    ],
    random_ts_between('2020-01-01'::timestamptz, now()),
    random_ts_between('2020-01-01'::timestamptz, now())
FROM lab_test_pairs
ON CONFLICT (lab_request_id, test_type_code) DO NOTHING;

-- ============================================================
-- 12. LAB SPECIMENS - FIXED: timeline berantai collected <= sent <= received
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Lab Specimens...'; END $$;

WITH spec_step1 AS (
    SELECT
        lr.id AS lab_request_id,
        lr.status,
        -- langkah 1: collected
        lr.requested_at + (random() * interval '2 days') AS collected_at
    FROM lab_requests lr
    WHERE lr.status IN ('SENT', 'RECEIVED', 'PARTIAL', 'COMPLETED')
),
spec_step2 AS (
    SELECT
        *,
        -- langkah 2: sent = collected + offset positif -> pasti >= collected
        collected_at + (random() * interval '2 days') AS sent_at
    FROM spec_step1
),
spec_step3 AS (
    SELECT
        *,
        -- langkah 3: received = sent + offset positif -> pasti >= sent
        CASE WHEN status NOT IN ('SENT')
             THEN sent_at + interval '2 hours' + (random() * interval '3 days')
             ELSE NULL
        END AS received_at
    FROM spec_step2
)
INSERT INTO lab_specimens (
    id, lab_request_id, specimen_code, specimen_type,
    collected_at, sent_at, received_at, condition_on_receipt,
    examination_possible, rejection_reason, notes, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    ss.lab_request_id,
    'SPEC-' || ss.lab_request_id::text,
    (ARRAY['Sputum', 'Dahak Pagi', 'Dahak Sewaktu', 'Cairan Pleura', 'Biopsi'])[1 + floor(random() * 5)::int],
    ss.collected_at,
    ss.sent_at,
    ss.received_at,
    CASE WHEN random() < 0.90 THEN (ARRAY['Baik', 'Memadai', 'Cukup'])[1 + floor(random() * 3)::int] ELSE 'Rusak' END,
    random() < 0.95,
    CASE WHEN random() < 0.05 THEN 'Sampel tumpah/rusak dalam pengiriman' ELSE NULL END,
    CASE WHEN random() < 0.20 THEN 'Sampel dalam kondisi baik' ELSE NULL END,
    ss.collected_at,
    ss.collected_at + (random() * interval '7 days')
FROM spec_step3 ss;

-- ============================================================
-- 13. LAB RESULTS - FIXED: hanya specimen yang sudah diterima
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Lab Results...'; END $$;

WITH result_source AS (
    SELECT
        lrt.id AS lab_request_test_id,
        lrt.test_type_code,
        ls.id AS specimen_id,
        ls.received_at
    FROM lab_request_tests lrt
    INNER JOIN lab_requests lr ON lr.id = lrt.lab_request_id
    INNER JOIN lab_specimens ls ON ls.lab_request_id = lr.id
    WHERE lrt.status IN ('IN_PROGRESS', 'RESULT_AVAILABLE')
        AND ls.examination_possible = true
        AND ls.received_at IS NOT NULL
    ORDER BY random()
    LIMIT 1000
)
INSERT INTO lab_results (
    id, lab_request_test_id, specimen_id, sequence_no, tested_at,
    result_code, result_value, result_text, status, verified_at,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    rs.lab_request_test_id,
    rs.specimen_id,
    1,
    rs.received_at + (random() * interval '5 days'),
    CASE rs.test_type_code
        WHEN 'MIKROSKOPIS_BTA' THEN (ARRAY['NEGATIF', 'POSITIF_1', 'POSITIF_2', 'POSITIF_3'])[1 + floor(random() * 4)::int]
        WHEN 'TCM' THEN (ARRAY['MTB_DETECTED', 'MTB_NOT_DETECTED', 'INVALID', 'ERROR'])[1 + floor(random() * 4)::int]
        WHEN 'BIAKAN' THEN (ARRAY['POSITIF', 'NEGATIF', 'KONTAMINASI'])[1 + floor(random() * 3)::int]
        WHEN 'UJI_KEPEKAAN' THEN (ARRAY['SENSITIF', 'RESISTEN'])[1 + floor(random() * 2)::int]
        ELSE 'COMPLETED'
    END,
    CASE WHEN random() < 0.30 THEN (random() * 1000)::int::text ELSE NULL END,
    CASE 
        WHEN rs.test_type_code = 'MIKROSKOPIS_BTA' THEN 'Pemeriksaan BTA dengan pewarnaan Ziehl-Neelsen'
        WHEN rs.test_type_code = 'TCM' THEN 'GeneXpert MTB/RIF'
        WHEN rs.test_type_code = 'BIAKAN' THEN 'Kultur pada media Lowenstein-Jensen'
        ELSE NULL
    END,
    (ARRAY['PRELIMINARY', 'FINAL', 'CORRECTED', 'CANCELLED'])[
        CASE WHEN random() < 0.10 THEN 1 WHEN random() < 0.90 THEN 2 WHEN random() < 0.97 THEN 3 ELSE 4 END
    ],
    CASE WHEN random() < 0.85 
         THEN rs.received_at + (random() * interval '6 days')
         ELSE NULL END,
    rs.received_at + (random() * interval '5 days'),
    rs.received_at + (random() * interval '7 days')
FROM result_source rs;

-- ============================================================
-- 14. TREATMENTS (700 records) - FIXED: timeline tanggal berantai
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Treatments...'; END $$;

WITH treat_source AS (
    SELECT
        tc.id AS case_id,
        tc.current_facility_id,
        tc.weight_kg,
        tc.confirmed_at,
        tc.status,
        -- start date ditentukan sekali
        tc.confirmed_at::date + (random() * 30)::int AS t_start,
        (SELECT id FROM regimens WHERE regimen_kind = 'TB_TREATMENT' ORDER BY random() LIMIT 1) AS regimen_id
    FROM tb_cases tc
    WHERE tc.status IN ('ACTIVE', 'COMPLETED', 'CLOSED', 'TRANSFERRED')
    ORDER BY random()
    LIMIT 700
)
INSERT INTO treatments (
    id, case_id, facility_id, regimen_id, regimen_description,
    start_date, planned_end_date, actual_end_date, initial_weight_kg,
    oat_form, drug_source, intensive_start_date, intensive_end_date,
    continuation_start_date, continuation_end_date, status, notes,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    ts.case_id,
    ts.current_facility_id,
    ts.regimen_id,
    NULL,
    ts.t_start,
    ts.t_start + 180,
    CASE WHEN ts.status IN ('COMPLETED', 'CLOSED') THEN ts.t_start + (150 + (random() * 60)::int) ELSE NULL END,
    ts.weight_kg,
    (ARRAY['KDT (FDC)', 'OAT Kombipak', 'Lepas'])[1 + floor(random() * 3)::int],
    (ARRAY['Program', 'Mandiri', 'Asuransi'])[1 + floor(random() * 3)::int],
    ts.t_start,
    ts.t_start + 60,
    ts.t_start + 60,
    CASE WHEN ts.status IN ('COMPLETED', 'CLOSED') THEN ts.t_start + (150 + (random() * 60)::int) ELSE NULL END,
    CASE ts.status
        WHEN 'ACTIVE' THEN 'ACTIVE'
        WHEN 'COMPLETED' THEN 'COMPLETED'
        WHEN 'CLOSED' THEN (ARRAY['COMPLETED', 'STOPPED'])[1 + floor(random() * 2)::int]
        WHEN 'TRANSFERRED' THEN 'TRANSFERRED'
        WHEN 'CANCELLED' THEN 'CANCELLED'
        ELSE 'ACTIVE'
    END,
    CASE WHEN random() < 0.30 THEN 'Pasien mulai pengobatan TB dengan regimen standar' ELSE NULL END,
    ts.t_start::timestamptz,
    ts.t_start::timestamptz + (random() * interval '30 days')
FROM treat_source ts;

-- ============================================================
-- 15. TREATMENT DRUGS
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Treatment Drugs...'; END $$;

WITH treatment_drug_pairs AS (
    SELECT 
        t.id AS treatment_id,
        d.id AS drug_id,
        d.name AS drug_name,
        t.start_date,
        t.intensive_end_date,
        t.continuation_end_date,
        ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY random()) AS rn
    FROM treatments t
    CROSS JOIN LATERAL (
        SELECT id, name FROM drugs WHERE active = true ORDER BY random() LIMIT (2 + floor(random() * 4)::int)
    ) d
)
INSERT INTO treatment_drugs (
    id, treatment_id, drug_id, drug_name_snapshot, treatment_phase,
    dose_value, dose_unit, frequency_per_week, start_date, end_date,
    batch_number, drug_source, notes, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    treatment_id,
    drug_id,
    drug_name,
    CASE WHEN rn <= 4 THEN 'INTENSIVE' ELSE 'CONTINUATION' END,
    CASE 
        WHEN drug_name LIKE '%Rifampicin%' THEN 450 + floor(random() * 151)
        WHEN drug_name LIKE '%Isoniazid%' THEN 300
        WHEN drug_name LIKE '%Pyrazinamide%' THEN 1000 + floor(random() * 501)
        WHEN drug_name LIKE '%Ethambutol%' THEN 750 + floor(random() * 501)
        ELSE 100 + floor(random() * 400)
    END,
    'mg',
    7,
    CASE WHEN rn <= 4 THEN start_date ELSE start_date + 60 END,
    CASE WHEN rn <= 4 THEN intensive_end_date ELSE continuation_end_date END,
    'BATCH-' || lpad((floor(random() * 1000000)::int)::text, 8, '0'),
    (ARRAY['Program', 'Mandiri', 'Donasi'])[1 + floor(random() * 3)::int],
    NULL,
    start_date::timestamptz,
    start_date::timestamptz + (random() * interval '7 days')
FROM treatment_drug_pairs;

-- ============================================================
-- 16. DOSE EVENTS (10000 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Dose Events (this may take a moment)...'; END $$;

WITH treatment_dates AS (
    SELECT 
        t.id AS treatment_id,
        t.start_date + n AS scheduled_date,
        t.status
    FROM treatments t
    CROSS JOIN generate_series(0, CASE 
        WHEN t.actual_end_date IS NOT NULL THEN (t.actual_end_date - t.start_date)
        WHEN t.status = 'ACTIVE' THEN LEAST(180, CURRENT_DATE - t.start_date)
        ELSE 180
    END) AS n
    WHERE t.status IN ('ACTIVE', 'COMPLETED', 'STOPPED')
    LIMIT 10000
)
INSERT INTO dose_events (
    id, treatment_id, scheduled_date, recorded_at, status,
    administration_mode, source, recorded_by_user_id, notes,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    treatment_id,
    scheduled_date,
    CASE WHEN random() < 0.85 THEN scheduled_date::timestamptz + (random() * interval '12 hours') ELSE NULL END,
    (ARRAY['TAKEN_OBSERVED', 'TAKEN_SELF_REPORTED', 'DISPENSED_HOME', 'MISSED', 'UNKNOWN'])[
        CASE WHEN random() < 0.50 THEN 1 WHEN random() < 0.75 THEN 2 WHEN random() < 0.85 THEN 3 WHEN random() < 0.95 THEN 4 ELSE 5 END
    ],
    (ARRAY['DIRECTLY_OBSERVED', 'SELF_ADMINISTERED', 'OTHER'])[
        CASE WHEN random() < 0.60 THEN 1 WHEN random() < 0.90 THEN 2 ELSE 3 END
    ],
    (ARRAY['SITB', 'PATIENT', 'HEALTH_WORKER', 'TBCALL', 'IMPORT'])[1 + floor(random() * 5)::int],
    (SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY random() LIMIT 1),
    CASE WHEN random() < 0.10 THEN 'Pasien minum obat dengan lancar' ELSE NULL END,
    scheduled_date::timestamptz,
    scheduled_date::timestamptz + (random() * interval '1 day')
FROM treatment_dates;

-- ============================================================
-- 17. FOLLOW-UPS - FIXED: completed_at & status konsisten
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Follow-ups...'; END $$;

WITH fu_source AS (
    SELECT
        t.id AS treatment_id,
        t.facility_id,
        t.start_date,
        -- tanggal jadwal ditentukan sekali
        (t.start_date + (random() * 180)::int)::timestamptz + (floor(random() * 24)::int || ' hours')::interval AS scheduled_at,
        -- status ditentukan sekali
        CASE WHEN random() < 0.30 THEN 'SCHEDULED'
             WHEN random() < 0.80 THEN 'COMPLETED'
             WHEN random() < 0.90 THEN 'MISSED'
             ELSE 'CANCELLED' END AS fu_status
    FROM treatments t
    ORDER BY random()
    LIMIT 1000
)
INSERT INTO follow_ups (
    id, treatment_id, follow_up_type, scheduled_at, completed_at,
    facility_id, health_worker_id, status, notes, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    fs.treatment_id,
    (ARRAY['Kontrol Bulan 1', 'Kontrol Bulan 2', 'Kontrol Bulan 3', 
           'Pemeriksaan Dahak', 'Kunjungan Rumah', 'Monitoring Efek Samping'])[1 + floor(random() * 6)::int],
    fs.scheduled_at,
    -- completed_at HANYA jika COMPLETED, dan selalu setelah scheduled
    CASE WHEN fs.fu_status = 'COMPLETED' AND fs.scheduled_at < now()
         THEN fs.scheduled_at + (random() * interval '48 hours')
         ELSE NULL END,
    fs.facility_id,
    (SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY random() LIMIT 1),
    fs.fu_status,
    CASE WHEN random() < 0.40 THEN 'Pasien datang kontrol rutin, kondisi baik' ELSE NULL END,
    fs.scheduled_at - (random() * interval '3 days'),
    fs.scheduled_at + (random() * interval '3 days')
FROM fu_source fs;

-- ============================================================
-- 18. TREATMENT OUTCOMES (400 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Treatment Outcomes...'; END $$;

INSERT INTO treatment_outcomes (
    id, treatment_id, outcome_code, outcome_date, notes, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    t.id,
    (SELECT code FROM treatment_outcome_codes ORDER BY random() LIMIT 1),
    COALESCE(t.actual_end_date, t.planned_end_date),
    CASE WHEN random() < 0.40 THEN 'Pengobatan selesai dengan hasil baik' ELSE NULL END,
    COALESCE(t.actual_end_date, t.planned_end_date)::timestamptz,
    COALESCE(t.actual_end_date, t.planned_end_date)::timestamptz + (random() * interval '7 days')
FROM treatments t
WHERE t.status IN ('COMPLETED', 'STOPPED')
    AND t.actual_end_date IS NOT NULL
ORDER BY random()
LIMIT 400;

-- ============================================================
-- 19. PATIENT SUPPORTERS / PMO (800 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Patient Supporters...'; END $$;

INSERT INTO patient_supporters (
    id, case_id, supporter_type, supporter_status, full_name,
    address, phone, organization_name, linked_user_id, notes,
    active, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    tc.id,
    (ARRAY['PMO', 'COMPANION'])[1 + floor(random() * 2)::int],
    (ARRAY['PMO Keluarga', 'PMO Kader', 'PMO Petugas', 'PMO Teman'])[1 + floor(random() * 4)::int],
    (ARRAY['Ibu', 'Bapak', 'Kakak', 'Adik', 'Suami', 'Istri', 'Anak', 'Kader'])[1 + floor(random() * 8)::int] || ' ' ||
    (ARRAY['Siti', 'Budi', 'Ahmad', 'Ratna', 'Eko', 'Dewi'])[1 + floor(random() * 6)::int],
    'Jl. ' || (ARRAY['Melati', 'Mawar', 'Anggrek', 'Kenanga'])[1 + floor(random() * 4)::int] || ' No. ' || (floor(random() * 100 + 1)::text),
    '08' || lpad((floor(random() * 10000000000)::bigint)::text, 10, '0'),
    CASE WHEN random() < 0.30 THEN (ARRAY['Kader Posyandu', 'Kader PKK', 'Kader Desa'])[1 + floor(random() * 3)::int] ELSE NULL END,
    CASE WHEN random() < 0.20 THEN (SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY random() LIMIT 1) ELSE NULL END,
    CASE WHEN random() < 0.30 THEN 'PMO aktif dan kooperatif' ELSE NULL END,
    random() < 0.95,
    random_ts_between('2020-01-01'::timestamptz, now()),
    random_ts_between('2020-01-01'::timestamptz, now())
FROM tb_cases tc
ORDER BY random()
LIMIT 800;

-- ============================================================
-- 20. REFERRALS (500 records) - FIXED: sent_at selalu terisi (NOT NULL)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Referrals...'; END $$;

WITH ref_source AS (
    SELECT
        tc.id AS case_id,
        tc.current_facility_id,
        t.id AS treatment_id,
        CASE WHEN random() < 0.05 THEN 'DRAFT'
             WHEN random() < 0.20 THEN 'SENT'
             WHEN random() < 0.45 THEN 'RECEIVED'
             WHEN random() < 0.75 THEN 'REPORTED'
             WHEN random() < 0.85 THEN 'CANCELLED'
             ELSE 'RETURNED' END AS ref_status,
        random_ts_between('2020-01-01'::timestamptz, now()) AS sent_at
    FROM tb_cases tc
    LEFT JOIN treatments t ON t.case_id = tc.id
    ORDER BY random()
    LIMIT 500
)
INSERT INTO referrals (
    id, case_id, treatment_id, referral_type,
    source_facility_id, destination_facility_id, sent_at, received_at,
    patient_reported_at, status, cancelled_at, cancel_reason, notes,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    rs.case_id,
    rs.treatment_id,
    (ARRAY['PRE_TREATMENT_REFERRAL', 'TREATMENT_TRANSFER'])[1 + floor(random() * 2)::int],
    rs.current_facility_id,
    (SELECT id FROM facilities ORDER BY random() LIMIT 1),
    rs.sent_at,  -- selalu terisi, tidak pernah NULL
    CASE WHEN rs.ref_status IN ('RECEIVED', 'REPORTED', 'RETURNED')
         THEN rs.sent_at + (random() * interval '5 days') ELSE NULL END,
    CASE WHEN rs.ref_status = 'REPORTED'
         THEN rs.sent_at + interval '5 days' + (random() * interval '5 days') ELSE NULL END,
    rs.ref_status,
    CASE WHEN rs.ref_status = 'CANCELLED'
         THEN rs.sent_at + (random() * interval '2 days') ELSE NULL END,
    CASE WHEN rs.ref_status = 'CANCELLED' THEN 'Pasien tidak dapat dilayani' ELSE NULL END,
    CASE WHEN random() < 0.40 THEN 'Rujukan untuk pengobatan lanjutan' ELSE NULL END,
    rs.sent_at,
    rs.sent_at + (random() * interval '15 days')
FROM ref_source rs;

-- ============================================================
-- 21. CONTACTS (1000 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Contacts...'; END $$;

INSERT INTO contacts (
    id, index_case_id, linked_patient_id, full_name, birth_date,
    sex_code, phone, address, relationship_to_index_case,
    household_contact, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    tc.id,
    CASE WHEN random() < 0.30 THEN (SELECT id FROM patients ORDER BY random() LIMIT 1) ELSE NULL END,
    (ARRAY['Istri', 'Suami', 'Anak', 'Ibu', 'Bapak', 'Kakak', 'Adik', 'Teman', 'Tetangga'])[1 + floor(random() * 9)::int] || ' dari Pasien',
    random_date_between('1950-01-01'::date, '2020-12-31'::date),
    (SELECT code FROM sex_codes ORDER BY random() LIMIT 1),
    CASE WHEN random() < 0.60 THEN '08' || lpad((floor(random() * 10000000000)::bigint)::text, 10, '0') ELSE NULL END,
    'Jl. ' || (ARRAY['Melati', 'Mawar', 'Anggrek'])[1 + floor(random() * 3)::int] || ' No. ' || (floor(random() * 100 + 1)::text),
    (ARRAY['Suami/Istri', 'Anak', 'Orangtua', 'Saudara Kandung', 'Teman', 'Rekan Kerja', 'Tetangga'])[1 + floor(random() * 7)::int],
    random() < 0.70,
    random_ts_between('2020-01-01'::timestamptz, now()),
    random_ts_between('2020-01-01'::timestamptz, now())
FROM tb_cases tc
CROSS JOIN generate_series(1, 2) AS n
WHERE random() < 0.6
LIMIT 1000;

-- ============================================================
-- 22. CONTACT INVESTIGATIONS (800 records) - FIXED: konsisten status/fasilitas/result
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Contact Investigations...'; END $$;

WITH ci_source AS (
    SELECT
        c.id AS contact_id,
        CASE WHEN random() < 0.60 THEN 'INTERNAL'
             WHEN random() < 0.80 THEN 'INCOMING_REFERRAL'
             ELSE 'OUTGOING_REFERRAL' END AS workflow_type,
        CASE WHEN random() < 0.10 THEN 'NEW'
             WHEN random() < 0.20 THEN 'SENT'
             WHEN random() < 0.30 THEN 'RECEIVED'
             WHEN random() < 0.45 THEN 'IN_PROGRESS'
             WHEN random() < 0.75 THEN 'COMPLETED'
             WHEN random() < 0.85 THEN 'RETURNED'
             ELSE 'CANCELLED' END AS ci_status,
        random_ts_between('2020-01-01'::timestamptz, now()) AS requested_at,
        (SELECT id FROM facilities ORDER BY random() LIMIT 1) AS dest_facility
    FROM contacts c
    ORDER BY random()
    LIMIT 800
)
INSERT INTO contact_investigations (
    id, contact_id, workflow_type, source_facility_id, destination_facility_id,
    requested_at, received_at, investigated_at, status, result_code,
    return_reason, notes, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    cs.contact_id,
    cs.workflow_type,
    (SELECT id FROM facilities ORDER BY random() LIMIT 1),
    CASE WHEN cs.workflow_type = 'INTERNAL' THEN NULL
         ELSE cs.dest_facility END,
    cs.requested_at,
    CASE WHEN cs.ci_status NOT IN ('NEW')
         THEN cs.requested_at + (random() * interval '3 days') ELSE NULL END,
    CASE WHEN cs.ci_status IN ('IN_PROGRESS', 'COMPLETED', 'RETURNED')
         THEN cs.requested_at + interval '3 days' + (random() * interval '7 days') ELSE NULL END,
    cs.ci_status,
    CASE WHEN cs.ci_status = 'COMPLETED'
         THEN (ARRAY['TIDAK_SAKIT', 'TERDUGA_TB', 'TB_AKTIF', 'TB_LATEN'])[1 + floor(random() * 4)::int]
         ELSE NULL END,
    CASE WHEN cs.ci_status = 'RETURNED' THEN 'Kontak tidak ditemukan di alamat yang diberikan' ELSE NULL END,
    CASE WHEN random() < 0.40 THEN 'Investigasi kontak dilakukan oleh petugas kesehatan' ELSE NULL END,
    cs.requested_at,
    cs.requested_at + (random() * interval '30 days')
FROM ci_source cs;

-- ============================================================
-- 23. PREVENTIVE TREATMENTS / TPT (600 records) - FIXED: timeline tanggal
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Preventive Treatments (TPT)...'; END $$;

WITH tpt_source AS (
    SELECT
        c.id AS contact_id,
        c.index_case_id,
        (SELECT id FROM facilities ORDER BY random() LIMIT 1) AS facility_id,
        (SELECT id FROM regimens WHERE regimen_kind = 'PREVENTIVE' ORDER BY random() LIMIT 1) AS regimen_id,
        random_date_between('2020-01-01'::date, CURRENT_DATE) AS t_start,
        CASE WHEN random() < 0.33 THEN 6 WHEN random() < 0.67 THEN 9 ELSE 3 END AS duration_val,
        (ARRAY['PLANNED', 'ACTIVE', 'COMPLETED', 'STOPPED', 'LOST_TO_FOLLOW_UP', 'CANCELLED'])[
            CASE WHEN random() < 0.10 THEN 1 WHEN random() < 0.40 THEN 2 WHEN random() < 0.70 THEN 3 WHEN random() < 0.80 THEN 4 WHEN random() < 0.90 THEN 5 ELSE 6 END
        ] AS tpt_status
    FROM contacts c
    ORDER BY random()
    LIMIT 600
)
INSERT INTO preventive_treatments (
    id, contact_id, patient_id, index_case_id, facility_id, regimen_id,
    start_date, planned_end_date, actual_end_date, duration_value,
    duration_unit, weight_kg, drug_source, status, outcome_code,
    notes, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    ts.contact_id,
    NULL,
    ts.index_case_id,
    ts.facility_id,
    ts.regimen_id,
    ts.t_start,
    ts.t_start + (ts.duration_val * 30),
    CASE WHEN ts.tpt_status IN ('COMPLETED', 'STOPPED')
         THEN ts.t_start + (ts.duration_val * 30) - ((random() * 30)::int) ELSE NULL END,
    ts.duration_val,
    'MONTH',
    20 + random() * 70,
    (ARRAY['Program', 'Mandiri'])[1 + floor(random() * 2)::int],
    ts.tpt_status,
    CASE WHEN ts.tpt_status = 'COMPLETED'
         THEN (ARRAY['COMPLETED', 'INCOMPLETE', 'LOST_TO_FOLLOW_UP'])[1 + floor(random() * 3)::int]
         ELSE NULL END,
    CASE WHEN random() < 0.30 THEN 'TPT diberikan sebagai pencegahan TB' ELSE NULL END,
    ts.t_start::timestamptz,
    ts.t_start::timestamptz + (random() * interval '30 days')
FROM tpt_source ts;

-- ============================================================
-- 24. ADVERSE EVENTS (300 records) - FIXED: ended_at setelah started_at
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Adverse Events...'; END $$;

WITH ae_source AS (
    SELECT
        t.id AS treatment_id,
        random_ts_between(t.start_date::timestamptz, now()) AS started_at
    FROM treatments t
    WHERE t.start_date < CURRENT_DATE
    ORDER BY random()
    LIMIT 300
)
INSERT INTO adverse_events (
    id, treatment_id, reported_at, event_type, severity, serious,
    started_at, ended_at, description, action_taken, outcome,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    aes.treatment_id,
    aes.started_at + (random() * interval '3 days'),
    (ARRAY['Mual', 'Muntah', 'Diare', 'Sakit Perut', 'Ruam Kulit', 'Gatal', 
           'Hepatitis', 'Neuropati', 'Gangguan Penglihatan', 'Nyeri Sendi'])[1 + floor(random() * 10)::int],
    (ARRAY['RINGAN', 'SEDANG', 'BERAT', 'MENGANCAM_NYAWA'])[
        CASE WHEN random() < 0.50 THEN 1 WHEN random() < 0.80 THEN 2 WHEN random() < 0.95 THEN 3 ELSE 4 END
    ],
    random() < 0.15,
    aes.started_at,
    CASE WHEN random() < 0.70 THEN aes.started_at + (random() * interval '30 days') ELSE NULL END,
    'Pasien mengalami efek samping obat',
    CASE WHEN random() < 0.80 THEN (ARRAY[
        'Obat simptomatik', 'Pengurangan dosis', 'Penghentian sementara', 
        'Ganti regimen', 'Observasi'])[1 + floor(random() * 5)::int] ELSE NULL END,
    CASE WHEN random() < 0.70 THEN (ARRAY['Sembuh', 'Membaik', 'Tetap', 'Memburuk'])[1 + floor(random() * 4)::int] ELSE NULL END,
    aes.started_at,
    aes.started_at + (random() * interval '30 days')
FROM ae_source aes;

-- ============================================================
-- 25. MONITORING PLANS (500 records)
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Monitoring Plans...'; END $$;

INSERT INTO monitoring_plans (
    id, treatment_id, status, start_date, end_date, rules_version,
    notes, created_by_user_id, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    t.id,
    CASE t.status
        WHEN 'ACTIVE' THEN 'ACTIVE'
        WHEN 'COMPLETED' THEN 'COMPLETED'
        ELSE (ARRAY['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'])[1 + floor(random() * 5)::int]
    END,
    t.start_date,
    t.actual_end_date,
    'v1.0',
    'Rencana monitoring otomatis untuk treatment',
    (SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY random() LIMIT 1),
    t.start_date::timestamptz,
    t.start_date::timestamptz + (random() * interval '30 days')
FROM treatments t
WHERE t.status IN ('ACTIVE', 'COMPLETED', 'PAUSED')
ORDER BY random()
LIMIT 500;

-- ============================================================
-- 26. MONITORING EVENTS (2000 records) - FIXED: completed setelah scheduled
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Monitoring Events...'; END $$;

WITH monitoring_event_data AS (
    SELECT 
        mp.id AS monitoring_plan_id,
        mp.start_date,
        mp.end_date,
        mp.treatment_id,
        n,
        (mp.start_date + (random() * COALESCE(mp.end_date - mp.start_date, 180))::int)::timestamptz AS scheduled_at
    FROM monitoring_plans mp
    CROSS JOIN generate_series(1, 4) AS n
    WHERE random() < 0.8
    LIMIT 2000
),
monitoring_event_data2 AS (
    SELECT
        *,
        scheduled_at + interval '3 days' AS due_at,
        CASE WHEN random() < 0.65
             THEN scheduled_at + (random() * interval '48 hours')
             ELSE NULL END AS completed_at
    FROM monitoring_event_data
)
INSERT INTO monitoring_events (
    id, monitoring_plan_id, event_type, scheduled_at, due_at,
    completed_at, status, source_entity_type, source_entity_id,
    metadata, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    monitoring_plan_id,
    (ARRAY['PEMERIKSAAN_DAHAK_BULAN_2', 'PEMERIKSAAN_DAHAK_BULAN_5',
           'KONTROL_RUTIN', 'MONITORING_EFEK_SAMPING',
           'KUNJUNGAN_RUMAH', 'KEPATUHAN_MINUM_OBAT'])[1 + floor(random() * 6)::int],
    med.scheduled_at,
    med.due_at,
    med.completed_at,
    CASE
        WHEN med.completed_at IS NOT NULL THEN 'COMPLETED'
        WHEN med.due_at < now() THEN (ARRAY['OVERDUE', 'CANCELLED'])[1 + floor(random() * 2)::int]
        ELSE (ARRAY['SCHEDULED', 'DUE'])[1 + floor(random() * 2)::int]
    END,
    'TREATMENT',
    med.treatment_id,
    '{"auto_generated": true}'::jsonb,
    med.scheduled_at - (random() * interval '3 days'),
    med.scheduled_at + (random() * interval '7 days')
FROM monitoring_event_data2 med;

-- ============================================================
-- 27. ALERTS (1000 records) - FIXED: monitoring event via monitoring_plans
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Alerts...'; END $$;

WITH alert_source AS (
    SELECT
        r.patient_id,
        tc.id AS case_id,
        t.id AS treatment_id,
        me.id AS monitoring_event_id,
        random_ts_between('2020-01-01'::timestamptz, now()) AS triggered_at,
        (ARRAY['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'])[
            CASE WHEN random() < 0.30 THEN 1 WHEN random() < 0.45 THEN 2 WHEN random() < 0.80 THEN 3 ELSE 4 END
        ] AS alert_status
    FROM tb_cases tc
    INNER JOIN tb_registrations r ON r.id = tc.registration_id
    CROSS JOIN LATERAL (SELECT id FROM treatments WHERE case_id = tc.id ORDER BY random() LIMIT 1) t
    -- monitoring event milik treatment yang sama, lewat monitoring_plans
    LEFT JOIN LATERAL (
        SELECT me2.id
        FROM monitoring_events me2
        INNER JOIN monitoring_plans mp ON mp.id = me2.monitoring_plan_id
        WHERE mp.treatment_id = t.id
        ORDER BY random() LIMIT 1
    ) me ON random() < 0.40
    WHERE random() < 0.3
    LIMIT 1000
),
alert_source2 AS (
    SELECT
        *,
        CASE WHEN alert_status IN ('ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')
             THEN triggered_at + (random() * interval '2 days') ELSE NULL END AS acknowledged_at
    FROM alert_source
),
alert_source3 AS (
    SELECT
        *,
        CASE WHEN alert_status = 'RESOLVED'
             THEN acknowledged_at + (random() * interval '5 days') ELSE NULL END AS resolved_at
    FROM alert_source2
)
INSERT INTO alerts (
    id, patient_id, case_id, treatment_id, monitoring_event_id,
    alert_type, severity, status, triggered_at, due_at,
    acknowledged_at, resolved_at, rule_code, message, details,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    patient_id,
    case_id,
    treatment_id,
    monitoring_event_id,
    (ARRAY['MISSED_DOSE', 'LATE_FOLLOW_UP', 'ADVERSE_EVENT',
           'LAB_RESULT_PENDING', 'TREATMENT_ADHERENCE_LOW',
           'CONTACT_SCREENING_DUE', 'MONITORING_OVERDUE'])[1 + floor(random() * 7)::int],
    (ARRAY['INFO', 'WARNING', 'HIGH', 'CRITICAL'])[
        CASE WHEN random() < 0.30 THEN 1 WHEN random() < 0.60 THEN 2 WHEN random() < 0.85 THEN 3 ELSE 4 END
    ],
    alert_status,
    triggered_at,
    triggered_at + interval '7 days',
    acknowledged_at,
    resolved_at,
    'RULE_' || lpad((floor(random() * 100)::int)::text, 3, '0'),
    (ARRAY['Pasien melewatkan dosis obat', 'Kontrol follow-up terlambat',
           'Hasil lab belum tersedia', 'Kepatuhan minum obat rendah'])[1 + floor(random() * 4)::int],
    '{"priority": "high", "requires_action": true}'::jsonb,
    triggered_at,
    COALESCE(resolved_at, triggered_at + (random() * interval '7 days'))
FROM alert_source3;

-- ============================================================
-- 28. NOTIFICATIONS (3000 records) - FIXED: sent -> delivered -> read berantai
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Generating Notifications...'; END $$;

WITH notification_data AS (
    SELECT 
        a.id AS alert_id,
        u.id AS user_id,
        a.triggered_at,
        (ARRAY['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED'])[
            CASE WHEN random() < 0.10 THEN 1 WHEN random() < 0.25 THEN 2 WHEN random() < 0.50 THEN 3 WHEN random() < 0.80 THEN 4 WHEN random() < 0.90 THEN 5 ELSE 6 END
        ] AS notif_status
    FROM alerts a
    CROSS JOIN LATERAL (
        SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY random() LIMIT (1 + floor(random() * 3)::int)
    ) u
    LIMIT 3000
),
notification_data2 AS (
    SELECT
        *,
        CASE WHEN notif_status NOT IN ('PENDING', 'CANCELLED', 'FAILED')
             THEN triggered_at + (random() * interval '30 minutes') ELSE NULL END AS sent_at
    FROM notification_data
),
notification_data3 AS (
    SELECT
        *,
        CASE WHEN notif_status IN ('DELIVERED', 'READ')
             THEN sent_at + (random() * interval '1 hour') ELSE NULL END AS delivered_at
    FROM notification_data2
),
notification_data4 AS (
    SELECT
        *,
        CASE WHEN notif_status = 'READ'
             THEN delivered_at + (random() * interval '24 hours') ELSE NULL END AS read_at
    FROM notification_data3
)
INSERT INTO notifications (
    id, alert_id, user_id, channel, status, scheduled_at,
    sent_at, delivered_at, read_at, payload, failure_reason,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    alert_id,
    user_id,
    (ARRAY['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'])[1 + floor(random() * 5)::int],
    notif_status,
    triggered_at,
    nd.sent_at,
    nd.delivered_at,
    nd.read_at,
    '{"title": "Alert Notification", "body": "You have a new alert"}'::jsonb,
    CASE WHEN notif_status = 'FAILED' THEN 'Delivery failed: recipient not reachable' ELSE NULL END,
    triggered_at,
    COALESCE(nd.read_at, nd.delivered_at, nd.sent_at, triggered_at)
FROM notification_data4 nd;

-- ============================================================
-- Final Summary
-- ============================================================
DO $$ DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Dummy Data Generation Complete!';
    RAISE NOTICE '==============================================';
    
    FOR rec IN 
        SELECT 'facilities' as table_name, COUNT(*) as count FROM facilities
        UNION ALL SELECT 'users', COUNT(*) FROM users
        UNION ALL SELECT 'patients', COUNT(*) FROM patients
        UNION ALL SELECT 'user_facilities', COUNT(*) FROM user_facilities
        UNION ALL SELECT 'user_roles', COUNT(*) FROM user_roles
        UNION ALL SELECT 'patient_user_links', COUNT(*) FROM patient_user_links
        UNION ALL SELECT 'tb_registrations', COUNT(*) FROM tb_registrations
        UNION ALL SELECT 'diagnoses', COUNT(*) FROM diagnoses
        UNION ALL SELECT 'tb_cases', COUNT(*) FROM tb_cases
        UNION ALL SELECT 'lab_requests', COUNT(*) FROM lab_requests
        UNION ALL SELECT 'lab_request_tests', COUNT(*) FROM lab_request_tests
        UNION ALL SELECT 'lab_specimens', COUNT(*) FROM lab_specimens
        UNION ALL SELECT 'lab_results', COUNT(*) FROM lab_results
        UNION ALL SELECT 'treatments', COUNT(*) FROM treatments
        UNION ALL SELECT 'treatment_drugs', COUNT(*) FROM treatment_drugs
        UNION ALL SELECT 'dose_events', COUNT(*) FROM dose_events
        UNION ALL SELECT 'follow_ups', COUNT(*) FROM follow_ups
        UNION ALL SELECT 'treatment_outcomes', COUNT(*) FROM treatment_outcomes
        UNION ALL SELECT 'patient_supporters', COUNT(*) FROM patient_supporters
        UNION ALL SELECT 'referrals', COUNT(*) FROM referrals
        UNION ALL SELECT 'contacts', COUNT(*) FROM contacts
        UNION ALL SELECT 'contact_investigations', COUNT(*) FROM contact_investigations
        UNION ALL SELECT 'preventive_treatments', COUNT(*) FROM preventive_treatments
        UNION ALL SELECT 'adverse_events', COUNT(*) FROM adverse_events
        UNION ALL SELECT 'monitoring_plans', COUNT(*) FROM monitoring_plans
        UNION ALL SELECT 'monitoring_events', COUNT(*) FROM monitoring_events
        UNION ALL SELECT 'alerts', COUNT(*) FROM alerts
        UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
    LOOP
        RAISE NOTICE '%: %', rec.table_name, rec.count;
    END LOOP;
END $$;

COMMIT;