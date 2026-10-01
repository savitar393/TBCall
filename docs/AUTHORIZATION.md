# Otorisasi dan lingkup identitas — Phase 1, 1.1, 2 dan 3A

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

Policy lab merupakan dasar scope request yang diarahkan ke laboratorium, bukan izin membaca pasien umum atau menulis pengobatan. Phase 2 menetapkan DTO SELF terbatas dalam [CLINICAL_INTAKE.md](CLINICAL_INTAKE.md). Detail lab Phase 3A memakai proyeksi minimum tersendiri; proyeksi lab untuk patient/supporter masih ditunda. Referral exceptions dan regional scope belum diimplementasikan.

## Staff-assisted SELF

POST `/api/v1/patients/{patientId}/account-link` menerima UUID `userId`. Caller harus TB_OFFICER dengan PATIENT_LINK_VERIFY dan scope pasien; target harus ACTIVE dengan kontak terverifikasi. Tidak ada pencarian/claim berdasarkan NIK.

Link dibuat atau diperbarui menjadi SELF VERIFIED dengan verified_by dan waktu Clock. Link PENDING dapat diverifikasi; REVOKED dapat diverifikasi ulang secara eksplisit; REJECTED tidak dibuka ulang oleh command ini. Link VERIFIED yang ada harus dicabut lebih dahulu. V9 memastikan maksimum satu SELF VERIFIED per pasien dan per user, termasuk writer lain yang melewati service.

Create menghasilkan 201; update existing link 200 dan wajib If-Match link. DELETE mencabut SELF VERIFIED dan wajib If-Match link. Respons menyertakan link id, patientId, userId, relationshipType, verificationStatus, version serta ETag. Riwayat waktu/verifier verifikasi dipertahankan saat pencabutan; audit mencatat pencabutan. Peran PATIENT ditambahkan saat verifikasi dan dihapus saat scope SELF dicabut.

Lock pasien dan user target menyerialkan binding identitas/perubahan assignment; unique partial indexes tetap menjadi jaminan terakhir. Ini lock sempit untuk identity binding, bukan pengganti optimistic locking pada command biasa.

## Supporter/PMO

POST/DELETE `/api/v1/cases/{caseId}/supporters/{supporterId}/account-link`: TB_OFFICER + SUPPORTER_LINK_MANAGE + scope case.currentFacility. Supporter harus milik case tersebut dan aktif. Setiap mutation wajib If-Match supporter; target harus ACTIVE/verified.

Link pertama memberi TREATMENT_SUPPORTER. Unlink terakhir menghapus peran; unlink salah satu dari beberapa link tidak menghapusnya. Pergantian target dengan versi yang benar memperbarui role lifecycle user lama/baru secara atomik. Lock user dalam urutan UUID konsisten menyerialkan lifecycle role, sementara JPA @Version menjaga record supporter. Tidak ada retry tersembunyi.

## Source authority

`ClinicalSourceAuthorityPolicy` memiliki `requireLocalCreate(actor, permission, facilityId, resourceType)` dan `requireLocalEdit(actor, permission, facilityId, resourceType, resourceId)`. Setiap write klinis Phase 2 memanggil policy setelah permission/scope check, termasuk PATIENT dan TB_REGISTRATION pada mode pasien baru. Implementasi prototype menerima write lokal dengan permission dan scope TB officer. Tidak ada tabel ownership baru, interpretasi hasil klinis atau dugaan field write-back SITB. Adapter otoritas SITB hanya dibuat setelah kontrak integrasi resmi tersedia.

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

## Clinical intake Phase 2

Endpoint klinis menerapkan current clinical patient scope: registrasi OPEN/DIAGNOSED pada assignment aktif atau case ACTIVE/REFERRED dengan currentFacility pada assignment aktif. CLOSED/CANCELLED/CONVERTED_TO_CASE registrations dan TRANSFERRED/COMPLETED/CLOSED/CANCELLED cases saja tidak cukup. List/detail hanya menampilkan episode current dalam scope, dengan field projection terpisah. Historical identity-link scope Phase 1 tetap berlaku hanya untuk workflow link.

Registrasi dapat dibaca berdasarkan facility asal, termasuk registrasi historis. Diagnosis mengikuti facility registrasi. Case mengikuti currentFacility. Akses patient detail tidak otomatis membuka registrasi/diagnosis dari facility lain. Endpoint scoped mengembalikan 404 yang sama untuk resource tidak ada atau di luar scope; role/permission/assignment yang tidak memenuhi syarat menghasilkan 403 ACCESS_DENIED.

POST `/patients/resolve` adalah pengecualian lookup exact untuk membuat registrasi: TB_OFFICER + PATIENT_IDENTITY_RESOLVE + assignment aktif, identitas WNI/WNA dan konfirmasi nama/tanggal lahir. Respons hanya identitas minimum yang dimask. UUID pasien historis saja tidak cukup untuk registrasi baru; konfirmasi diulang dalam transaksi. Lookup tidak membuka history atau clinical detail.

SYSTEM_ADMIN, FACILITY_ADMIN, PROGRAM_MONITOR dan LAB_STAFF tidak mendapat akses Phase 2 tanpa role TB_OFFICER, permission dan scope yang diperlukan. GET `/me/patient` memerlukan PATIENT + PATIENT_READ + link SELF VERIFIED; pencabutan link langsung menutup akses pada request berikutnya. Tidak ada HIV/DM, NIK/BPJS, notes, audit/sync atau data supporter pada proyeksi SELF.

V11 hanya memberi PATIENT_IDENTITY_RESOLVE kepada TB_OFFICER dan menambah partial index untuk other_identity_number. V1–V10 tetap utuh. [Arsitektur Phase 2](architecture/TBCall_Application_API_v1.2_Phase2_Clinical_Intake.md) menetapkan kontrak endpoint dan batas field.

## Laboratory Phase 3A

- Create request, record source specimen dan cancel: TB_OFFICER + LAB_REQUEST_WRITE + assignment aktif pada requestingFacility. Owner registrasi mengikuti facility registrasi; owner kasus mengikuti currentFacility.
- List/detail: LAB_REQUEST_READ dengan TB_OFFICER pada requestingFacility atau LAB_STAFF pada testingFacility. Actor dengan kedua role mendapat union tanpa duplikasi. Filter facility hanya menerima UUID dalam assignment aktif actor; predicate scope sesuai role tetap berlaku.
- Receipt, result FINAL dan correction: LAB_STAFF + LAB_RESULT_WRITE + assignment aktif pada testingFacility. TB_OFFICER tanpa LAB_STAFF tidak dapat menulis hasil, termasuk pada INTERNAL request.
- Payload hasil pada GET detail memerlukan LAB_RESULT_READ tambahan. Respons writer berada dalam izin LAB_RESULT_WRITE. DTO hanya memberi UUID/nama/jenis kelamin/tanggal lahir pasien dan konteks request, bukan NIK/BPJS, HIV/DM, alamat, account, audit/sync atau riwayat klinis lain.
- Tidak ada bypass untuk SYSTEM_ADMIN, FACILITY_ADMIN, PROGRAM_MONITOR, PATIENT atau TREATMENT_SUPPORTER. Role/permission/tanpa assignment menghasilkan 403; resource tidak ada/di luar scope menghasilkan 404 yang sama.

`LaboratorySourceAuthorityPolicy` terpisah dari `ClinicalSourceAuthorityPolicy`: source-side writes memanggil policy dengan requestingFacility, laboratory-side writes dengan testingFacility. Prototype memeriksa role/permission/facility dan hanya mengizinkan write lokal. Semua clinical source checks tetap berlaku. Tidak ada perubahan grant/migrasi. Lihat [LABORATORY.md](LABORATORY.md).
