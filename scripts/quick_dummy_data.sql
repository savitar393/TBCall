-- ============================================================
-- TBCall Quick Dummy Data Generator
-- Generates 1000 records for main tables using PostgreSQL
-- WARNING: FOR TESTING/DEVELOPMENT ONLY!
-- ============================================================

BEGIN;

-- Helper function untuk random date
CREATE OR REPLACE FUNCTION random_date_between(start_date date, end_date date)
RETURNS date AS $$
BEGIN
    RETURN start_date + floor(random() * (end_date - start_date + 1))::int;
END;
$$ LANGUAGE plpgsql;

-- Helper function untuk random timestamp  
CREATE OR REPLACE FUNCTION random_ts_between(start_ts timestamptz, end_ts timestamptz)
RETURNS timestamptz AS $$
BEGIN
    RETURN start_ts + random() * (end_ts - start_ts);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. FACILITIES (1000 records)
-- ============================================================
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
-- 2. PATIENTS (1000 records)
-- ============================================================
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
-- 3. USERS (1000 records)
-- ============================================================
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
-- Verification Query
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Dummy Data Generation Complete!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Facilities: % records', (SELECT COUNT(*) FROM facilities);
    RAISE NOTICE 'Patients: % records', (SELECT COUNT(*) FROM patients);
    RAISE NOTICE 'Users: % records', (SELECT COUNT(*) FROM users);
    RAISE NOTICE '==============================================';
END $$;

COMMIT;

-- Clean up helper functions
DROP FUNCTION IF EXISTS random_date_between(date, date);
DROP FUNCTION IF EXISTS random_ts_between(timestamptz, timestamptz);
