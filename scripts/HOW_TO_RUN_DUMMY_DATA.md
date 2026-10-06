# Cara Menjalankan Dummy Data Generator

## ✅ File yang Sudah Dibuat

**`V99__complete_dummy_data.sql`** - Migration file lengkap yang generate data untuk **28 tabel utama**.

### Record yang Di-generate:

| Tabel | Jumlah Records |
|-------|----------------|
| facilities | 1,000 |
| users | 1,000 |
| patients | 1,000 |
| user_facilities | ~2,000 |
| user_roles | ~1,500 |
| patient_user_links | ~300 |
| tb_registrations | 1,000 |
| diagnoses | 800 |
| tb_cases | 600 |
| lab_requests | 1,000 |
| lab_request_tests | ~1,500 |
| lab_specimens | ~800 |
| lab_results | 1,000 |
| treatments | 700 |
| treatment_drugs | ~2,000 |
| **dose_events** | **10,000** |
| follow_ups | 1,000 |
| treatment_outcomes | 400 |
| patient_supporters | 800 |
| referrals | 500 |
| contacts | 1,000 |
| contact_investigations | 800 |
| preventive_treatments | 600 |
| adverse_events | 300 |
| monitoring_plans | 500 |
| monitoring_events | 2,000 |
| alerts | 1,000 |
| notifications | 3,000 |

**TOTAL: ~35,000+ records**

---

## 🚀 Metode 1: Menggunakan Flyway (RECOMMENDED)

### Langkah 1: Pastikan Database Kosong atau Siap
```bash
# Check apakah migration sudah jalan
mvn flyway:info
```

### Langkah 2: Run Migration
```bash
# Run semua migrations termasuk V99 dummy data
mvn flyway:migrate

# Atau dengan Spring Boot
mvn spring-boot:run
```

### Estimasi Waktu:
- **5-10 menit** untuk complete execution
- Bergantung pada hardware (CPU, RAM, disk speed)

---

## 🚀 Metode 2: Langsung Execute SQL

### Langkah 1: Connect ke Database
```bash
psql -U username -d tbcall
```

### Langkah 2: Execute File
```sql
\i 'D:/# SEMESTER 5/ADE PENTING/TBCall/src/main/resources/db/migration/V99__complete_dummy_data.sql'
```

Atau dari command line:
```bash
psql -U username -d tbcall -f "src/main/resources/db/migration/V99__complete_dummy_data.sql"
```

---

## 🚀 Metode 3: Menggunakan DBeaver / pgAdmin

### DBeaver:
1. Buka connection ke database TBCall
2. Klik kanan pada database → **SQL Editor** → **Open SQL Script**
3. Browse ke file `V99__complete_dummy_data.sql`
4. Klik **Execute SQL Statement** (Ctrl+Enter)
5. Tunggu hingga selesai (~5-10 menit)

### pgAdmin:
1. Connect ke database TBCall
2. Klik **Tools** → **Query Tool**
3. Klik **Open File** dan pilih `V99__complete_dummy_data.sql`
4. Klik **Execute/Refresh** (F5)
5. Monitor progress di Messages panel

---

## 📊 Verifikasi Data

Setelah execution selesai, jalankan query ini untuk verify:

```sql
-- Summary record count
SELECT 
    'facilities' as table_name, COUNT(*) as count FROM facilities
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'patients', COUNT(*) FROM patients
UNION ALL
SELECT 'tb_registrations', COUNT(*) FROM tb_registrations
UNION ALL
SELECT 'tb_cases', COUNT(*) FROM tb_cases
UNION ALL
SELECT 'treatments', COUNT(*) FROM treatments
UNION ALL
SELECT 'dose_events', COUNT(*) FROM dose_events
UNION ALL
SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL
SELECT 'preventive_treatments', COUNT(*) FROM preventive_treatments
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
ORDER BY count DESC;

-- Check data workflow integrity
SELECT 
    'Total Patients' as metric,
    COUNT(*) as value
FROM patients
UNION ALL
SELECT 
    'Patients with TB Registration',
    COUNT(DISTINCT r.patient_id)
FROM tb_registrations r
UNION ALL
SELECT 
    'Registrations with Diagnosis',
    COUNT(DISTINCT d.registration_id)
FROM diagnoses d
UNION ALL
SELECT 
    'Diagnoses converted to Cases',
    COUNT(DISTINCT tc.registration_id)
FROM tb_cases tc
UNION ALL
SELECT 
    'Cases with Treatment',
    COUNT(DISTINCT t.case_id)
FROM treatments t
UNION ALL
SELECT 
    'Treatments with Dose Events',
    COUNT(DISTINCT de.treatment_id)
FROM dose_events de;

-- Sample data check
SELECT 
    p.full_name,
    p.nik,
    r.registration_date,
    tc.status as case_status,
    t.status as treatment_status
FROM patients p
LEFT JOIN tb_registrations r ON r.patient_id = p.id
LEFT JOIN tb_cases tc ON tc.registration_id = r.id
LEFT JOIN treatments t ON t.case_id = tc.id
LIMIT 10;
```

---

## 🧹 Cleanup - Menghapus Semua Dummy Data

**⚠️ DANGER: Ini akan menghapus SEMUA data!**

```sql
-- HANYA untuk development/testing!
-- JANGAN jalankan di production!

BEGIN;

TRUNCATE TABLE 
    notifications,
    alerts,
    monitoring_events,
    monitoring_plans,
    adverse_events,
    patient_supporters,
    treatment_outcomes,
    follow_ups,
    dose_events,
    treatment_drugs,
    treatments,
    preventive_treatments,
    contact_investigations,
    contacts,
    referrals,
    lab_results,
    lab_specimens,
    lab_request_tests,
    lab_requests,
    diagnoses,
    tb_cases,
    tb_registrations,
    patient_user_links,
    patients,
    user_verification_tokens,
    user_sessions,
    user_facilities,
    user_roles,
    users,
    sync_items,
    sync_runs,
    external_identifiers,
    audit_logs
RESTART IDENTITY CASCADE;

-- Keep reference data tables (facility_types, sex_codes, etc.)
-- Keep master tables with reference data (facilities, roles, permissions, drugs, regimens)

COMMIT;
```

---

## 🔧 Troubleshooting

### 1. Error: "relation does not exist"
**Cause**: Migration V1-V17 belum jalan
**Solution**: 
```bash
mvn flyway:migrate
# Atau
psql -f V1__initial_schema.sql
psql -f V2__reference_data.sql
# ... dst
```

### 2. Error: "out of memory"
**Cause**: PostgreSQL memory limit
**Solution**: Increase `work_mem` temporarily:
```sql
SET work_mem = '256MB';
-- Then run the migration
```

### 3. Execution terlalu lama (>15 menit)
**Cause**: Hardware limitation atau indexes
**Solution**: 
- Drop indexes temporarily (NOT RECOMMENDED)
- Run in smaller batches
- Check system resources

### 4. Error: "duplicate key value violates unique constraint"
**Cause**: Data sudah ada atau collision
**Solution**: Cleanup dulu atau ubah seed random:
```sql
-- At start of script, add:
SELECT setseed(0.123456789); -- Change seed value
```

---

## 📈 Performance Tips

### Sebelum Execute:
```sql
-- Disable autovacuum temporarily
ALTER TABLE <table_name> SET (autovacuum_enabled = false);

-- Increase checkpoint segments
SET checkpoint_segments = 64;

-- Increase maintenance work mem
SET maintenance_work_mem = '512MB';
```

### Setelah Execute:
```sql
-- Re-enable autovacuum
ALTER TABLE <table_name> SET (autovacuum_enabled = true);

-- Analyze tables
ANALYZE;

-- Vacuum full (optional, bisa lama)
VACUUM FULL;
```

---

## 📝 Notes

### Data Characteristics:
- ✅ **NIK Indonesia valid** (16 digit)
- ✅ **BPJS valid** (13 digit)  
- ✅ **Phone numbers** format 08xxxxxxxxxx
- ✅ **Addresses** dengan RT/RW
- ✅ **Region codes** (provinsi, kabupaten, kecamatan, desa)
- ✅ **Indonesian names** (Ahmad, Siti, Budi, dll)
- ✅ **Foreign keys** semua valid
- ✅ **Timestamps** realistic (2020 - now)
- ✅ **Workflow** natural (Registration → Diagnosis → Case → Treatment)

### Distributions:
- 80% users ACTIVE
- 70% patients punya BPJS  
- 85% emails verified
- 95% facilities active
- 60% registrations menjadi cases
- 90% cases dapat treatment

### Script Features:
- ✅ Progress notifications (RAISE NOTICE)
- ✅ Transaction wrapped (BEGIN/COMMIT)
- ✅ Helper functions auto-cleanup
- ✅ Final summary report
- ✅ Random but realistic data
- ✅ Proper foreign key relationships

---

## 🎯 Use Cases

### 1. Testing Application
```bash
# Load dummy data
mvn flyway:migrate

# Run application
mvn spring-boot:run

# Test endpoints
curl http://localhost:8080/api/patients
curl http://localhost:8080/api/tb-cases
```

### 2. Performance Testing
```sql
-- Test query performance with realistic data
EXPLAIN ANALYZE
SELECT * FROM tb_cases tc
JOIN treatments t ON t.case_id = tc.id
JOIN dose_events de ON de.treatment_id = t.id
WHERE tc.status = 'ACTIVE';
```

### 3. UI/UX Development
- Navigate aplikasi dengan data realistic
- Test pagination dengan 1000+ records
- Test search functionality
- Test filtering dan sorting

### 4. Demo/Presentation
- Show realistic Indonesia TB program data
- Demonstrate full workflow
- Show monitoring & alerts features

---

## ✅ Checklist

Sebelum run:
- [ ] Database TBCall sudah dibuat
- [ ] Migrations V1-V17 sudah jalan
- [ ] Reference data sudah ter-load (V2)
- [ ] Backup database (jika perlu)
- [ ] Cukup disk space (~500MB)
- [ ] PostgreSQL running dengan good performance

Setelah run:
- [ ] Verify record counts
- [ ] Check data integrity (foreign keys)
- [ ] Test sample queries
- [ ] Test application dengan dummy data
- [ ] Document any issues

---

**Ready to Go! 🚀**

```bash
# Quick start:
cd "D:/# SEMESTER 5/ADE PENTING/TBCall"
mvn flyway:migrate
```
