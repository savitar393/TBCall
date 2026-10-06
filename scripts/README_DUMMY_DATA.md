# TBCall Dummy Data Generator

Script untuk generate data dummy sebanyak 1000 baris untuk setiap tabel dalam database TBCall.

## ⚠️ PERINGATAN

**HANYA UNTUK TESTING DAN DEVELOPMENT!**
Jangan jalankan script ini di environment production.

## Metode 1: Menggunakan Python Script (Rekomendasi)

### Prerequisites
- Python 3.7+
- psycopg2 (opsional, jika ingin langsung insert ke database)

### Cara Penggunaan

#### 1. Generate SQL File
```bash
python scripts/generate_dummy_data.py > dummy_data.sql
```

#### 2. Execute ke Database
```bash
psql -U username -d dbname -f dummy_data.sql
```

#### 3. Atau Execute Langsung (TODO: implement)
```bash
python scripts/generate_dummy_data.py --execute --db-url postgresql://user:pass@localhost/dbname
```

## Metode 2: Menggunakan Flyway Migration

### 1. Copy Migration File
File dummy data sudah disiapkan sebagai migration dengan nomor tinggi (V99) sehingga tidak mengganggu migration production.

### 2. Run Flyway
```bash
mvn flyway:migrate
```

Atau jika menggunakan Gradle:
```bash
gradle flywayMigrate
```

## Struktur Data yang Di-Generate

### Tabel Utama (1000 records each)

1. **Facilities** - Fasilitas kesehatan
2. **Users** - User sistem
3. **Patients** - Data pasien
4. **TB Registrations** - Registrasi terduga TB
5. **Diagnoses** - Diagnosis TB
6. **TB Cases** - Kasus TB terkonfirmasi
7. **Treatments** - Pengobatan TB
8. **Lab Requests** - Permintaan laboratorium
9. **Lab Results** - Hasil laboratorium
10. **Dose Events** - Catatan minum obat (20,000 records)
11. **Contacts** - Kontak pasien
12. **Contact Investigations** - Investigasi kontak
13. **Preventive Treatments (TPT)** - Pengobatan pencegahan
14. **Follow-ups** - Tindak lanjut
15. **Referrals** - Rujukan
16. **Patient Supporters (PMO)** - Pengawas minum obat
17. **Adverse Events** - Efek samping obat
18. **Monitoring Plans** - Rencana monitoring
19. **Monitoring Events** - Event monitoring (3000 records)
20. **Alerts** - Alert sistem (2000 records)
21. **Notifications** - Notifikasi (5000 records)

### Tabel Reference Data (varies)

- **Roles** - 20 roles
- **Permissions** - 50 permissions
- **Drugs** - 100 drugs
- **Regimens** - 30 regimens
- **External Systems** - 5 systems

## Karakteristik Data Dummy

### Data Realistis
- NIK Indonesia format yang valid (16 digit)
- Nomor telepon Indonesia (08xxxxxxxxxx)
- Nomor BPJS (13 digit)
- Kode wilayah Indonesia (provinsi, kabupaten, kecamatan, desa)
- Tanggal dan waktu realistis (2020 - sekarang)
- Nama-nama Indonesia

### Distribusi Data
- 80% users status ACTIVE
- 70% patients memiliki BPJS
- 95% facilities active
- 85% email verified
- Data follow natural workflows (Registration → Diagnosis → Case → Treatment)

### Foreign Key Relationships
Script memastikan semua foreign key valid dengan:
- Patients → TB Registrations → Diagnoses → TB Cases → Treatments
- Facilities → Lab Requests → Lab Results
- TB Cases → Contacts → Contact Investigations → TPT
- Treatments → Dose Events, Follow-ups, Adverse Events

## Custom Indonesian Data

### Nama Tempat
- Jakarta, Bandung, Surabaya, Medan, Makassar, Semarang
- Jalan Merdeka, Sudirman, Gatot Subroto, Asia Afrika, Diponegoro

### Nama Orang
- First names: Ahmad, Budi, Candra, Siti, Ratna, Putri, dll
- Last names: Santoso, Wijaya, Susanto, Pratiwi, Wulandari, dll

### Tipe Fasilitas
- Puskesmas
- Rumah Sakit (RSUD)
- Klinik TB
- Balai Pengobatan
- BP4/BBKPM/BKPM
- Lapas/Rutan
- Praktek Dokter Mandiri

## Cleanup Script

Untuk menghapus semua dummy data:

```sql
-- DANGER: This will delete ALL data!
-- Use with extreme caution

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
    user_facilities,
    user_roles,
    user_sessions,
    user_verification_tokens,
    users,
    external_identifiers,
    sync_items,
    sync_runs,
    audit_logs
CASCADE;

COMMIT;
```

## Verifikasi Data

Setelah generate, verifikasi dengan query:

```sql
-- Check record counts
SELECT 'facilities' as table_name, COUNT(*) as count FROM facilities
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
ORDER BY count DESC;

-- Check data integrity
SELECT 
    'Patients without registration' as check_name,
    COUNT(*) as count
FROM patients p
LEFT JOIN tb_registrations r ON r.patient_id = p.id
WHERE r.id IS NULL;

-- Check workflow progression
SELECT 
    r.status as registration_status,
    COUNT(DISTINCT r.id) as registration_count,
    COUNT(DISTINCT d.id) as diagnosis_count,
    COUNT(DISTINCT tc.id) as case_count,
    COUNT(DISTINCT t.id) as treatment_count
FROM tb_registrations r
LEFT JOIN diagnoses d ON d.registration_id = r.id
LEFT JOIN tb_cases tc ON tc.registration_id = r.id
LEFT JOIN treatments t ON t.case_id = tc.id
GROUP BY r.status
ORDER BY r.status;
```

## Troubleshooting

### Error: Duplicate Key Violation
Jika terjadi duplicate key (terutama pada unique constraints seperti NIK, BPJS):
- Re-run script akan generate data baru dengan UUID berbeda
- Atau tambahkan WHERE NOT EXISTS clause

### Error: Foreign Key Violation
Pastikan generate tables dalam urutan yang benar:
1. Reference tables (facility_types, sex_codes, dll)
2. Master tables (facilities, users, patients)
3. Transaction tables (registrations, cases, treatments)
4. Detail tables (dose_events, lab_results, dll)

### Performance Issues
Jika insert lambat:
- Disable constraints temporary (NOT RECOMMENDED for production)
- Use COPY instead of INSERT (modify script)
- Increase PostgreSQL work_mem and maintenance_work_mem
- Run in batches

```sql
-- Temporarily disable constraints (DANGER!)
ALTER TABLE table_name DISABLE TRIGGER ALL;
-- ... insert data ...
ALTER TABLE table_name ENABLE TRIGGER ALL;
```

## Contributing

Untuk menambah generator table baru:

1. Buat function `generate_<table_name>()` di Python script
2. Pastikan urutan generate sesuai dependency (foreign keys)
3. Tambahkan realistic data sesuai context Indonesia / TB program
4. Test dengan sample kecil dulu (10-100 records)
5. Verifikasi referential integrity

## License

Internal use only - TBCall Project
