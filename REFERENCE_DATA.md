# Data referensi TBCall v1.1

Semua kode, ID, nama tabel, dan nama kolom adalah pilihan kanonis **TBCall**, bukan kode basis data/API resmi SITB. Panduan yang digunakan menjelaskan konsep, alur, dan terminologi; kontrak fisik/API SITB belum tersedia. Tidak ada akun, pasien, sistem eksternal, atau data klinis contoh dalam migrasi.

## Sumber dan prioritas

V1 dan V2 adalah migrasi historis yang tidak diubah. **V2 merupakan baseline lama dari SITB 2021**, bukan katalog klinis terkini. V3–V7 menerapkan [spesifikasi arsitektur v1.1](docs/architecture/TBCall_Domain_Schema_v1.1.md). Panduan resmi lokal disimpan di `docs/reference-local/`, diabaikan Git dan tidak diperlukan saat build.

| Sumber | Bukti yang diperiksa | Penggunaan |
|---|---|---|
| Petunjuk Teknis SITB Ver 2 Mei 2021 | Modul terduga/pasien SO/RO, laboratorium, rujukan, kontak/TPT, pengguna; bagian 3.9–3.11 dan panduan pengguna | Alur, konsep entri, batas modul, pemisahan tanggung jawab; baseline V2 |
| Penatalaksanaan Tuberkulosis Sensitif Obat di Indonesia, 2025 | Klasifikasi, halaman cetak 50–51 (PDF 75–76); paduan, halaman 52 (PDF 78); Tabel 24, halaman 135 (PDF 161) | Riwayat pengobatan, hasil akhir, paduan SO |
| Penatalaksanaan TBC RO di Indonesia, 2024 | Definisi resistansi, halaman xix (PDF 21); klasifikasi 21–22 (PDF 43–44); Bab VI, Tabel 6.1 dan Gambar 6.1 (PDF 63–65), bagian paduan 6.3–6.6; Tabel 9.2 (PDF 140) | Resistansi, pemeriksaan molekuler/kepekaan, obat/paduan RO dan Hr |
| Tata Laksana Tuberkulosis Anak dan Remaja, 2023 | Tabel 6.2 dan 6.3, halaman 38 (PDF 54); paduan pendek halaman 39 (PDF 55) | Paduan anak/remaja; tabel fase mengonfirmasi 2RHZE/10RH |
| Tuberkulosis dengan Komorbid, 2025 | Status merokok/paparan dan komorbid lain, halaman 6 (PDF 37); faktor risiko halaman 8 (PDF 39), bagian nutrisi | Jenis kondisi tambahan, riwayat observasi |

Pedoman nasional mendukung **konsep klinis**. Spesifikasi v1.1 menetapkan kode, struktur observasi, matriks peran, dan batas implementasi TBCall. Tidak ada aturan eligibilitas, dosis, interpretasi hasil, atau pemilihan paduan otomatis.

## V3: katalog terkini dan kompatibilitas historis

Hasil akhir aktif lengkap: `GAGAL` (Gagal Pengobatan), `MENINGGAL`, `PUTUS_BEROBAT`, **`SEMBUH`**, **`PENGOBATAN_LENGKAP`**, **`TIDAK_DAPAT_DIEVALUASI`**. Tiga kode tebal ditambahkan V3. `BERHASIL_DIOBATI` tidak disimpan sebagai hasil akhir; merupakan agregat sembuh + pengobatan lengkap.

Riwayat aktif: `BARU`, `KAMBUH`, **`RIWAYAT_PENGOBATAN_SEBELUMNYA`** (Riwayat Pengobatan TBC Sebelumnya). `TIDAK_DIKETAHUI` tetap aktif hanya sebagai cadangan kualitas data/impor TBCall, bukan klasifikasi klinis terkini.

Enam kode lama berikut tetap ada dengan `active=false`, tanpa penghapusan, penggantian kode, atau pemetaan ulang data historis:

- `SETELAH_GAGAL_KAT_1`
- `SETELAH_GAGAL_KAT_2`
- `SETELAH_PUTUS_BEROBAT`
- `HASIL_SEBELUMNYA_TIDAK_DIKETAHUI`
- `SETELAH_GAGAL_LINI_2`
- `LAIN_LAIN`

Pemeriksaan aktif: `MIKROSKOPIS_BTA`, `TCM`, `BIAKAN`, `UJI_KEPEKAAN`, `LPA_LINI_DUA`, **`LPA_LINI_SATU`**, **`TCM_XDR`**, **`RONTGEN_TORAKS`**, **`HIV`**. Katalog dapat memuat konsep pemeriksaan dengan spesimen opsional. Tidak ada enum hasil per jenis pemeriksaan.

Kode `TB_SO`/`TB_RO` pada kategori dan terduga tetap; tampilan memakai TBC. Kode `PRAKTEK_DOKTER_MANDIRI` tetap; tampilan menjadi `Praktik dokter mandiri`. `FOLLOW_UP` tetap; tampilan menjadi `Tindak lanjut`. Katalog identitas, lokasi anatomi, HIV, DM, kehamilan, BCG, dan jenis fasyankes V2 lainnya tetap aktif.

## V4: klasifikasi resistansi dan observasi tambahan

`drug_resistance_patterns` aktif:

| Kode | Tampilan |
|---|---|
| `TB_SO` | TBC Sensitif Obat (TBC SO) |
| `TB_HR` | TBC Sensitif Rifampisin, Resistan Isoniazid (TBC Hr) |
| `TB_RR` | TBC Resistan Rifampisin (TBC RR) |
| `TB_MDR` | TBC Multidrug-Resistant (TBC MDR) |
| `TB_PRE_XDR` | TBC Pre-Extensively Drug-Resistant (TBC pre-XDR) |
| `TB_XDR` | TBC Extensively Drug-Resistant (TBC XDR) |

`tb_cases.drug_resistance_pattern_code` opsional; tidak diturunkan otomatis dari kategori kasar SO/RO. Tidak ada pembatasan kombinasi kategori/pola yang belum disetujui.

`additional_condition_types` aktif: `KURANG_GIZI`, `MEROKOK`, `TERPAPAR_ASAP_ROKOK`, `GANGGUAN_KESEHATAN_MENTAL`, `HEPATITIS`, `PENYAKIT_PERNAPASAN_KRONIS`, `GANGGUAN_GINJAL`, `GANGGUAN_IMUNITAS_LAIN`, `COVID_19`.

`case_condition_observations` menyimpan riwayat; beberapa observasi jenis yang sama pada satu kasus diperbolehkan. Status internal `PRESENT`/`ABSENT`/`UNKNOWN`, waktu observasi wajib, klasifikasi dan sumber opsional. `classification_code varchar(100)` tidak memiliki katalog baru yang diada-adakan; `source varchar(60)` dapat menyimpan `SITB`, `TBCALL`, `IMPORT` atau sumber masa depan. Jenis kondisi memiliki kode 60 karakter. HIV/DM tetap pada field khusus; tidak diduplikasi sebagai jenis tambahan. Timestamp dibuat/diperbarui database.

## V5: katalog obat dan paduan

21 konsep obat aktif:

| Kode | Nama |
|---|---|
| H | Isoniazid |
| R | Rifampisin |
| Z | Pirazinamid |
| E | Etambutol |
| P | Rifapentine |
| MFX | Moksifloksasin |
| LFX | Levofloksasin |
| BDQ | Bedaquiline |
| PA | Pretomanid |
| LZD | Linezolid |
| CFZ | Clofazimine |
| CS | Sikloserin |
| TRD | Terizidone |
| DLM | Delamanid |
| ETO | Etionamid |
| PTO | Protionamid |
| PAS | Asam para-aminosalisilat |
| IPM_CLN | Imipenem-silastatin |
| MPM | Meropenem |
| AMK | Amikasin |
| S | Streptomisin |

12 paduan aktif (`regimen_kind=TB_TREATMENT`):

| Kode | Nama | Jalur program |
|---|---|---|
| `SO_6M_2HRZE_4HR` | Paduan OAT SO 6 bulan (2HRZE/4HR) | TB_SO |
| `SO_4M_2HPMZ_2HPM` | Paduan OAT SO 4 bulan (2HPMZ/2HPM) | TB_SO |
| `SO_CHILD_6M_2RHZ_4RH` | Paduan anak 2RHZ/4RH | TB_SO |
| `SO_CHILD_6M_2RHZE_4RH` | Paduan anak/remaja 2RHZE/4RH | TB_SO |
| `SO_CHILD_12M_2RHZE_10RH` | Paduan anak 2RHZE/10RH | TB_SO |
| `SO_CHILD_4M_2RHZ_2RH` | Paduan jangka pendek anak 2RHZ/2RH | TB_SO |
| `RO_HR_6RZE_LFX` | Paduan TBC Hr 6 RZE-Lfx | TB_RO |
| `RO_BPALM` | Paduan BPaLM | TB_RO |
| `RO_BPAL` | Paduan BPaL | TB_RO |
| `RO_9M_ETO` | Paduan TBC RO 9 bulan variasi etionamid | TB_RO |
| `RO_9M_LZD` | Paduan TBC RO 9 bulan variasi linezolid | TB_RO |
| `RO_LONG_INDIVIDUAL` | Paduan TBC RO jangka panjang/individual | TB_RO |

Nama obat memakai nama generik yang disetujui; PAS dan imipenem-silastatin memakai padanan Indonesia. Hr ditempatkan pada jalur RO sesuai kode paduan yang disetujui, tetapi tetap sensitif rifampisin. Kekuatan, bentuk sediaan, tanggal pemberlakuan dan `regimen_drugs` tidak diisi: v1.1 menyetujui konsep katalog, belum kontrak dosis/fase/formulasi atau tanggal implementasi nasional. Komposisi jangka panjang bersifat individual. Tidak ada katalog paduan TPT baru yang ditambahkan.

## V6: integritas relasi

Diagnosis pengonfirmasi menggunakan `UNIQUE(id,registration_id)` dan FK komposit kasus. Trigger validasi menegakkan kesamaan permintaan spesimen/pemeriksaan, kasus rujukan/pengobatan, kasus indeks kontak/TPT, pasien/kasus/pengobatan peringatan, dan tanggal hasil akhir >= mulai pengobatan. Tautan opsional tetap opsional sesuai V1.

Trigger pada parent juga menolak perubahan permintaan spesimen/pemeriksaan, kasus pengobatan/kontak, registrasi kasus, pasien registrasi, serta tanggal mulai pengobatan yang merusak dependent yang sudah ada. Validasi child mengambil row lock `FOR SHARE` pada parent terkait untuk berkoordinasi dengan update pada isolasi PostgreSQL bawaan `READ COMMITTED`. Constraint dan trigger berlaku untuk SQL langsung maupun JPA. Migrasi memeriksa data lama dan berhenti jika ditemukan lineage tidak konsisten; rekonsiliasi harus diputuskan sebelum upgrade, tanpa perbaikan otomatis.

## V7: RBAC TBCall

Tujuh peran bawaan (`system_role=true` berarti peran bawaan, bukan hak administrator):

| Kode | Tampilan | Jumlah izin |
|---|---|---:|
| PATIENT | Pasien | 19 |
| TREATMENT_SUPPORTER | Pendamping Pengobatan / PMO | 9 |
| TB_OFFICER | Petugas TBC | 35 |
| LAB_STAFF | Petugas Laboratorium | 8 |
| FACILITY_ADMIN | Administrator Fasyankes | 5 |
| PROGRAM_MONITOR | Pengelola / Pemantau Program TBC | 3 |
| SYSTEM_ADMIN | Administrator Sistem | 7 |

41 izin dan 86 pemetaan eksplisit disimpan dalam [V7](src/main/resources/db/migration/V7__rbac_reference_data.sql). Matriks kemampuan arsitektur diterjemahkan ke izin berikut; scope dan proyeksi field wajib diterapkan oleh layanan mendatang sebelum data dapat diakses:

- **PATIENT:** `PATIENT_READ`, `REGISTRATION_READ`, `DIAGNOSIS_READ`, `CASE_READ`, `LAB_REQUEST_READ`, `LAB_RESULT_READ`, `TREATMENT_READ`, `ADHERENCE_READ`, `ADHERENCE_RECORD`, `FOLLOW_UP_READ`, `OUTCOME_READ`, `TPT_READ`, `ADVERSE_EVENT_READ`, `REFERRAL_READ`, `MONITORING_READ`, `ALERT_READ`, `ALERT_ACKNOWLEDGE`, `NOTIFICATION_READ_SELF`, `REPORT_READ`. Hanya diri sendiri; kontak orang lain tidak diberikan.
- **TREATMENT_SUPPORTER:** `PATIENT_READ`, `CASE_READ`, `TREATMENT_READ`, `ADHERENCE_READ`, `ADHERENCE_RECORD`, `MONITORING_READ`, `ALERT_READ`, `ALERT_ACKNOWLEDGE`, `NOTIFICATION_READ_SELF`. Hanya pasien tertaut; pembacaan pasien/kasus/pengobatan berupa proyeksi minimum untuk tugas pendampingan, tanpa HIV/DM atau rincian diagnostik yang tidak perlu.
- **TB_OFFICER:** semua izin klinis dan pemantauan sesuai matriks, kecuali `LAB_RESULT_WRITE`; juga `NOTIFICATION_READ_SELF`, `REPORT_READ`. Tanpa izin administrasi pengguna/fasyankes/peran, audit atau integrasi.
- **LAB_STAFF:** `PATIENT_READ`, `CASE_READ`, `LAB_REQUEST_READ`, `LAB_RESULT_READ`, `LAB_RESULT_WRITE`, `MONITORING_READ`, `NOTIFICATION_READ_SELF`, `REPORT_READ`. Informasi pasien/kasus minimum dan pembacaan pemantauan terbatas untuk tugas laboratorium dalam penugasan. Acknowledge/resolve peringatan khusus laboratorium menunggu rancangan yang disebut “later” dalam matriks, sehingga belum diberikan.
- **FACILITY_ADMIN:** `USER_MANAGE_FACILITY`, `FACILITY_MANAGE`, `AUDIT_READ`, `REPORT_READ`, `NOTIFICATION_READ_SELF`. Scope fasyankes; tanpa pembacaan/penulisan klinis.
- **PROGRAM_MONITOR:** `AUDIT_READ`, `REPORT_READ`, `NOTIFICATION_READ_SELF`. Laporan agregat dan audit yang diizinkan; akses klinis pasien/regional menunggu model scope terpisah.
- **SYSTEM_ADMIN:** `USER_MANAGE_FACILITY`, `FACILITY_MANAGE`, `ROLE_MANAGE`, `AUDIT_READ`, `REPORT_READ`, `INTEGRATION_MANAGE`, `NOTIFICATION_READ_SELF`. Scope sistem untuk administrasi, audit dan laporan operasional; tanpa pembacaan/penulisan klinis.

Izin notifikasi sendiri diberikan kepada semua peran; grant ini tidak mengaktifkan pengiriman notifikasi. `REPORT_READ` tidak berarti akses dataset pasien mentah: laporan diri, fasyankes, laboratorium, agregat program, dan operasional sistem berbeda menurut scope. `USER_MANAGE_FACILITY` digunakan administrator sistem untuk administrasi pengguna lintas fasyankes sesuai matriks; kode tetap, scope sistem harus eksplisit. `AUDIT_READ` harus membatasi tampilan metadata/payload sensitif sesuai tugas; hak audit/operasional tidak menjadi akses klinis terselubung.

Belum ada penegakan otorisasi dalam checkpoint persistensi. Identitas tautan, scope, proyeksi field, transisi status, editabilitas sumber SITB, target polimorfik, aturan klinis dan workflow rujukan harus diselesaikan pada lapisan layanan/API berikutnya. Tidak ada kontradiksi yang mengharuskan perubahan V1/V2.

## V8: koreksi deskripsi dan hardening runtime

V8 mempertahankan kode/nama `drug_resistance_patterns.TB_SO`, dengan deskripsi terkini: **TBC Sensitif Obat sesuai klasifikasi program; interpretasi rinci mengikuti hasil uji kepekaan dan pedoman nasional.** Deskripsi V4 yang lebih membatasi tetap ada dalam migrasi historis, tetapi bukan deskripsi runtime setelah V8. Tidak ada perubahan katalog/peran lainnya atau interpretasi hasil otomatis. Kebijakan default Java, timestamp dan optimistic locking dijelaskan dalam [PERSISTENCE_RUNTIME.md](docs/PERSISTENCE_RUNTIME.md).
