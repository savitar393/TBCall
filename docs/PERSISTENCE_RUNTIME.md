# Kebijakan runtime persistensi TBCall v1.2

Checkpoint ini menerapkan [arsitektur v1.2](architecture/TBCall_Runtime_Persistence_v1.2.md) melalui satu migrasi: `V8__persistence_runtime_hardening.sql`. V1–V7 tetap utuh; Flyway adalah otoritas skema dan Hibernate memakai `validate`. Tidak ada layanan, API, autentikasi, atau otomasi klinis dalam checkpoint ini.

## Koreksi referensi

Kode dan nama `drug_resistance_patterns.TB_SO` tetap. Deskripsinya menjadi:

> TBC Sensitif Obat sesuai klasifikasi program; interpretasi rinci mengikuti hasil uji kepekaan dan pedoman nasional.

Koreksi ini mengganti deskripsi V4 yang terlalu membatasi klasifikasi program. Tidak ada interpretasi otomatis hasil laboratorium. Kode dan struktur tetap kanonis TBCall, bukan spesifikasi fisik/API SITB.

## Optimistic locking

26 tabel berikut mendapat `version bigint NOT NULL DEFAULT 0`; entitas terkait memakai `@Version` pada `long version`. Data lama dan record baru mulai dari 0. Hibernate mengikutsertakan versi lama dalam update/delete dan menaikkan versi saat update berhasil. Tidak ada indeks versi atau trigger yang menaikkan versi. `@DynamicUpdate` pada `TBCase` tetap, tetapi perlindungan konkurensi berasal dari `@Version`.

| Tabel | Entitas |
|---|---|
| facilities | Facility |
| users | User |
| patients | Patient |
| patient_user_links | PatientUserLink |
| tb_registrations | TBRegistration |
| diagnoses | Diagnosis |
| tb_cases | TBCase |
| lab_requests | LabRequest |
| lab_request_tests | LabRequestTest |
| lab_specimens | LabSpecimen |
| lab_results | LabResult |
| treatments | Treatment |
| treatment_drugs | TreatmentDrug |
| dose_events | DoseEvent |
| follow_ups | FollowUp |
| treatment_outcomes | TreatmentOutcome |
| patient_supporters | PatientSupporter |
| referrals | Referral |
| contacts | Contact |
| contact_investigations | ContactInvestigation |
| preventive_treatments | PreventiveTreatment |
| adverse_events | AdverseEvent |
| monitoring_plans | MonitoringPlan |
| monitoring_events | MonitoringEvent |
| alerts | Alert |
| notifications | Notification |

Katalog referensi/klinis, katalog dan join RBAC, audit append-only, serta pembukuan sinkronisasi tidak diberi versi. `case_condition_observations` juga tidak diberi versi karena tidak tercantum dalam scope V8; setiap perubahan scope memerlukan keputusan arsitektur terpisah.

## Default deterministik

57 default pada 45 entitas dicerminkan sebagai initializer Java, dengan tipe field dan default PostgreSQL tetap. Nilai tersedia pada objek baru sebelum persist/reload. Initializer adalah nilai awal: tidak menghalangi pembacaan data lama yang memiliki `active=false` atau status berbeda, dan tidak mengganti setter/null dengan aturan klinis baru.

- `active=true`: FacilityType, SexCode, TBSuspectType, AnatomicalSite, DiagnosisType, PreviousTreatmentCategory, HivStatus, DmStatus, PregnancyStatus, BcgStatus, TBCaseCategory, LabTestType, LabRequestReason, TreatmentOutcomeCode, Facility, Regimen, Drug, PatientSupporter, ExternalSystem, DrugResistancePattern, AdditionalConditionType; juga UserFacility.
- `Role.systemRole=false`, `UserFacility.isPrimary=false`, `Patient.birthDateUnknown=false`, `AdverseEvent.serious=false`.
- Status: User=`PENDING`; PatientUserLink.verificationStatus=`PENDING`; TBRegistration=`OPEN`; TBCase/Treatment/PreventiveTreatment/MonitoringPlan=`ACTIVE`; LabRequest/LabRequestTest=`REQUESTED`; LabResult=`FINAL`; FollowUp/MonitoringEvent=`SCHEDULED`; Referral=`SENT`; ContactInvestigation=`NEW`; Alert=`OPEN`; Notification=`PENDING`.
- `PatientUserLink.relationshipType=SELF`, `DoseEvent.source=TBCALL`, `Alert.severity=INFO`.
- `LabResult.sequenceNo=1`, `RegimenDrug.sequenceNo=1`.
- Map kosong yang mutable dan terpisah per instance (`new HashMap<>()`): MonitoringEvent.metadata, Alert.details, Notification.payload, AuditLog.metadata.
- SyncRun: `direction=INBOUND`, `status=RUNNING`, `recordsReceived=0`, `recordsCreated=0`, `recordsUpdated=0`, `recordsFailed=0`.

Daftar field individual lengkap tetap ada dalam arsitektur v1.2. Tidak ada enum baru atau custom version logic.

## Timestamp

Timestamp audit yang sudah dibuat/diperbarui database tetap dimiliki database. Field timestamp tidak diberi initializer `OffsetDateTime.now()`, callback jam, atau anotasi timestamp Hibernate. Business timestamp yang wajib diisi aplikasi akan ditetapkan eksplisit oleh layanan menggunakan `Clock` yang diinjeksikan.

Default yang bergantung jam database dapat tetap null dalam objek Java sesudah insert sampai refresh/reload. Jika nilai tersebut diperlukan segera, atau record akan diubah lagi saat masih memiliki default database yang belum terhidrasi, lakukan refresh/reload terlebih dahulu. Jangan mengasumsikan initializer default deterministik ikut menghidrasi timestamp.

## Pembatasan SQL runtime

Write runtime pada tabel ber-versi harus melalui lifecycle JPA/Hibernate. SQL langsung yang mengabaikan versi dilarang. Ini termasuk JDBC, native query, dan bulk update/delete JPQL/HQL, yang dapat melewati optimistic locking otomatis.

Jika jalur SQL khusus benar-benar diperlukan, jalur tersebut harus menggunakan versi yang diharapkan, menaikkan versi saat update berhasil, dan memeriksa jumlah row yang terpengaruh. Contoh kontrak update:

```sql
UPDATE patients
SET full_name = :full_name, version = version + 1
WHERE id = :id AND version = :expected_version;
```

Satu row berarti berhasil; nol row harus diperlakukan sebagai konflik/record tidak tersedia sesuai kontrak layanan, bukan diikuti update tanpa predicate versi. Delete khusus juga harus menyertakan versi yang diharapkan. Persistence context/cache yang terpengaruh harus di-refresh atau dibersihkan. Jangan membuat trigger increment versi: itu bertabrakan dengan Hibernate.

SQL fixture pada tes integritas V6 digunakan untuk menguji constraint database secara langsung dalam transaksi yang dikendalikan tes. Itu bukan jalur write runtime yang diizinkan bagi layanan mendatang.

## Transaksi dan konflik pada fase berikutnya

- Isolasi transaksi biasa: PostgreSQL/Spring `READ_COMMITTED`.
- Metode command/use-case pada layanan menjadi pemilik transaksi. Query boleh memakai `@Transactional(readOnly = true)`.
- Optimistic locking merupakan strategi konkurensi biasa. User-originated clinical conflict tidak boleh di-retry diam-diam.
- API mendatang memetakan konflik optimistic ke HTTP **409**, dengan pesan: **Data telah berubah sejak terakhir dibuka. Muat ulang data sebelum menyimpan kembali.** Belum ada implementasi API/error mapper di checkpoint ini.
- Retry background hanya jika dibatasi, idempotent, dan ditinjau eksplisit.
- Pessimistic locking hanya untuk alur sempit yang memang satu-per-satu, misalnya konsumsi token sekali pakai, penerimaan rujukan, atau binding identitas eksternal unik.
- Invarian V6 tetap otoritatif; versi tidak menggantikan constraint relasi.

Scope izin + scope data + proyeksi field, editabilitas sumber SITB, dan review aturan klinis tetap mengikuti arsitektur v1.2. Tidak ada tebakan write-back SITB atau tabel otoritas sumber baru.

## Bukti tes

PostgreSQL Testcontainers memulai database kosong. Suite memeriksa V1–V8 dan startup Hibernate `validate`, scope kolom/versi JPA, seluruh default sebelum persist dan sesudah reload, map yang tidak dibagi antar instance, timestamp database, serta koreksi deskripsi.

Untuk Patient, TBCase dan Treatment, dua EntityManager dengan transaksi `READ_COMMITTED` dan koneksi PostgreSQL berbeda membaca record versi 0 sebelum salah satu commit. Update pemenang tersimpan pada versi 1; flush dari pembaca lama gagal dengan `OptimisticLockException`. EntityManager ketiga memeriksa bahwa perubahan pemenang tetap tersimpan. Tidak ada dua referensi dari satu persistence context yang dianggap sebagai konkurensi.
