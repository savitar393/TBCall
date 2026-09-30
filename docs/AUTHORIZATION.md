# Otorisasi dan lingkup identitas — Phase 1 dan 1.1

Otorisasi adalah **permission + scope + field projection**. Peran administrator tidak memiliki bypass akses klinis. [Arsitektur Application/API v1](architecture/TBCall_Application_API_v1.md) tetap menjadi kontrak untuk fase berikutnya.

## Resolusi current actor

Session filter memuat identitas ACTIVE, assignment peran beserta nama Indonesia, permission melalui role_permissions, user_facilities aktif dengan fasilitas aktif, link SELF VERIFIED, serta case IDs dari patient_supporters aktif. Nilai dibaca dari database setiap request dan diteruskan sebagai DTO/snapshot, bukan entity JPA. Snapshot hanya berlaku untuk request tersebut.

## Policy yang dapat dipakai ulang

| Policy | Syarat |
|---|---|
| TB officer facility | role TB_OFFICER + permission command + facility dalam assignment aktif |
| TB officer patient link (`requireOfficerPatientLinkScope`) | syarat di atas + registrasi pada facility tersebut atau case.currentFacility dalam scope; asosiasi historis tetap dapat dipakai untuk identity linking |
| TB officer clinical patient (`requireOfficerClinicalPatientScope`) | syarat di atas + registrasi OPEN/DIAGNOSED pada facility tersebut atau case ACTIVE/REFERRED dengan currentFacility dalam scope |
| TB officer case | syarat di atas + case.currentFacility dalam scope |
| Patient SELF | role PATIENT + permission use-case + tepat patient dari link SELF VERIFIED |
| Supporter case | role TREATMENT_SUPPORTER + permission use-case + active linked supporter pada case |
| Lab request | role LAB_STAFF + permission use-case + testingFacility request dalam assignment aktif |

Policy lab merupakan dasar scope request yang diarahkan ke laboratorium, bukan izin membaca pasien umum atau menulis pengobatan. Policy self/supporter tidak menetapkan DTO klinis; proyeksi HIV/DM/NIK/BPJS dan detail lab tetap dibatasi oleh kontrak use-case pada fase berikutnya. Referral exceptions dan regional scope belum diimplementasikan.

## Staff-assisted SELF

POST `/api/v1/patients/{patientId}/account-link` menerima UUID `userId`. Caller harus TB_OFFICER dengan PATIENT_LINK_VERIFY dan scope pasien; target harus ACTIVE dengan kontak terverifikasi. Tidak ada pencarian/claim berdasarkan NIK.

Link dibuat atau diperbarui menjadi SELF VERIFIED dengan verified_by dan waktu Clock. Link PENDING dapat diverifikasi; REVOKED dapat diverifikasi ulang secara eksplisit; REJECTED tidak dibuka ulang oleh command ini. Link VERIFIED yang ada harus dicabut lebih dahulu. V9 memastikan maksimum satu SELF VERIFIED per pasien dan per user, termasuk writer lain yang melewati service.

Create menghasilkan 201; update existing link 200 dan wajib If-Match link. DELETE mencabut SELF VERIFIED dan wajib If-Match link. Respons menyertakan link id, patientId, userId, relationshipType, verificationStatus, version serta ETag. Riwayat waktu/verifier verifikasi dipertahankan saat pencabutan; audit mencatat pencabutan. Peran PATIENT ditambahkan saat verifikasi dan dihapus saat scope SELF dicabut.

Lock pasien dan user target menyerialkan binding identitas/perubahan assignment; unique partial indexes tetap menjadi jaminan terakhir. Ini lock sempit untuk identity binding, bukan pengganti optimistic locking pada command biasa.

## Supporter/PMO

POST/DELETE `/api/v1/cases/{caseId}/supporters/{supporterId}/account-link`: TB_OFFICER + SUPPORTER_LINK_MANAGE + scope case.currentFacility. Supporter harus milik case tersebut dan aktif. Setiap mutation wajib If-Match supporter; target harus ACTIVE/verified.

Link pertama memberi TREATMENT_SUPPORTER. Unlink terakhir menghapus peran; unlink salah satu dari beberapa link tidak menghapusnya. Pergantian target dengan versi yang benar memperbarui role lifecycle user lama/baru secara atomik. Lock user dalam urutan UUID konsisten menyerialkan lifecycle role, sementara JPA @Version menjaga record supporter. Tidak ada retry tersembunyi.

## Source authority

`ClinicalSourceAuthorityPolicy` disediakan; implementasi prototype menerima edit lokal yang telah memiliki permission dan scope TB officer. Phase 1 tidak membuka clinical edit endpoint. Tidak ada tabel ownership baru, interpretasi hasil klinis atau dugaan field write-back SITB. Adapter otoritas SITB hanya dibuat setelah kontrak integrasi resmi tersedia.

## V9

- unique partial index `(patient_id)` untuk SELF VERIFIED;
- unique partial index `(user_id)` untuk SELF VERIFIED;
- index `(user_id, verification_status)`;
- partial index `patient_supporters(linked_user_id)` untuk active non-null links;
- PATIENT_LINK_VERIFY dan SUPPORTER_LINK_MANAGE hanya diberikan ke TB_OFFICER.

Semua grant V7 lainnya tetap. V1–V9 tidak diedit. Phase 1.1 menambah V10: USER_ACCOUNT_MANAGE hanya SYSTEM_ADMIN serta index token. Tidak ada endpoint generic clinical CRUD.

## Administrasi Phase 1.1

SYSTEM_ADMIN wajib permission sesuai command untuk master fasyankes, lookup user, membership, peran global dan status akun. FACILITY_ADMIN + USER_MANAGE_FACILITY hanya dapat mengelola membership di active facility scope sendiri; lookup exact menampilkan assignment sendiri dan boolean untuk assignment lain. Tanpa assignment aktif, peran operasional inert. Nama peran global tetap berlaku pada semua assignment fasilitas aktif user; role per facility memerlukan arsitektur/migrasi terpisah.

Peran PATIENT/TREATMENT_SUPPORTER hanya dimutasi melalui workflow link. USER_ACCOUNT_MANAGE tidak memberi akses klinis. Target role/add membership harus ACTIVE dan verified. Admin tidak boleh menghapus atau menonaktifkan SYSTEM_ADMIN usable terakhir. Lihat [ADMINISTRATION.md](ADMINISTRATION.md) untuk proyeksi DTO, status dan locking.

Scope clinical patient baru diuji namun belum dipakai oleh endpoint klinis. CLOSED/CANCELLED/CONVERTED_TO_CASE registrations dan TRANSFERRED/COMPLETED/CLOSED/CANCELLED cases saja tidak cukup. Scope patient saat ini tidak otomatis membuka seluruh resource historis; service Phase 2 harus menambah check pada setiap resource dan proyeksi field.
