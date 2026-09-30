# Keamanan identitas — Application/API v1 Phase 1 dan 1.1

Implementasi mengikuti [arsitektur Phase 1](architecture/TBCall_Application_API_v1.md) dan [Phase 1.1](architecture/TBCall_Application_API_v1.1_Admin_Recovery.md). V1–V9 tidak berubah; Flyway V10 menambah izin status akun dan index token. Hibernate tetap `validate`.

## Kredensial dan verifikasi

- Pendaftaran membuat User `PENDING` tanpa peran maupun data klinis. Minimal satu email/telepon; email dinormalisasi lowercase, nomor Indonesia `08...` menjadi `+628...`; format internasional E.164 diterima.
- Panjang kata sandi 12–128 karakter Java. Seluruh kata sandi UTF-8 dihash SHA-256, hasil binary di-Base64, lalu BCrypt cost 12. Prefix penyimpanan `{bcrypt-sha256}` membedakan format. Pilihan ini mempertahankan kontribusi seluruh kata sandi di atas batas input 72 byte BCrypt; tidak melakukan pemotongan diam-diam. Prefix bukan API publik.
- Token verifikasi dan sesi berasal dari `SecureRandom` 32 byte (256 bit), Base64 URL-safe tanpa padding; hanya hash SHA-256 disimpan. Token verifikasi berlaku 30 menit secara default; durasi positif dan maksimal 24 jam.
- Konsumsi token menggunakan lock baris PostgreSQL dalam transaksi yang sama dengan `used_at`, timestamp verifikasi, aktivasi, dan audit. Dua konsumen menghasilkan tepat satu keberhasilan. Verifikasi tidak mengaktifkan kembali akun SUSPENDED/DISABLED dan tidak menerima token PASSWORD_RESET/PATIENT_LINK sebagai verifikasi kontak.
- Akun menjadi ACTIVE setelah minimal satu identitas terkonfigurasi diverifikasi. Login melalui identitas lain yang belum diverifikasi tetap ditolak. PENDING/SUSPENDED/DISABLED tidak dapat login atau memakai sesi lama.
- Kesalahan login tidak membedakan identitas tidak dikenal, kata sandi salah, status akun, atau identitas belum diverifikasi. Verifikasi kata sandi tetap dilakukan sebelum pemeriksaan status; identitas tidak dikenal memakai hash pembanding dengan cost sama.

## Delivery port

`VerificationDeliveryPort` adalah batas adapter email/SMS. Production tidak mengembalikan token mentah; daftar token respons pendaftaran kosong. Adapter deployment harus mengirim ke kontak yang disebutkan tanpa mencatat token/kata sandi. Adapter default menolak dengan 503 dan transaksi pendaftaran rollback apabila delivery tidak tersedia. Tidak ada pengiriman jaringan palsu dalam checkpoint.

Untuk dev/test saja, aktifkan **ketiganya**: profil `dev`/`test`, `tbcall.security.production=false`, `tbcall.security.expose-verification-tokens=true`. Profil `prod`/`production` tetap melarang exposure walaupun flag production dimatikan. Konfigurasi berbahaya menggagalkan startup. Adapter default dalam mode eksplisit tersebut menggunakan respons pendaftaran sebagai delivery lokal.

Delivery sinkron dapat mendahului commit database; kegagalan commit menghasilkan token yang tidak dapat digunakan. Resend/reset sudah tersedia pada Phase 1.1; outbox dan pengiriman background perlu keputusan terpisah saat adapter pengiriman nyata dibangun. Port melaporkan isAvailable(); registrasi/resend/reset request mengembalikan 503 yang sama sebelum lookup identitas ketika delivery tidak tersedia. Respons recovery tetap generik 202 ketika delivery tersedia, tanpa token bahkan di development. Adapter lokal default hanya mendukung token respons registrasi; recovery lokal memerlukan adapter development eksplisit. Lihat [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md).

## Sesi browser

- Opaque token disimpan di tabel `user_sessions`; umur 8 jam, tidak diperpanjang diam-diam. Logout mengisi `revoked_at` serta menghapus cookie browser.
- `TBCALL_SESSION`: HttpOnly, Secure wajib dalam production, SameSite=Strict, path `/`. Hanya token cookie yang mengautentikasi; tidak ada JWT, HTTP Basic, form login, atau servlet authentication session.
- Setiap request memeriksa expiry/revocation/status dan menyusun peran, izin, fasilitas aktif, SELF terverifikasi serta tautan pendamping aktif dari database. Perubahan scope tidak menunggu login baru.
- CSRF aktif untuk seluruh mutation, termasuk login. `XSRF-TOKEN` dapat dibaca JavaScript dan dikirim sebagai `X-XSRF-TOKEN`; cookie CSRF bukan token autentikasi. GET `/me` menerbitkan cookie bahkan jika responsnya 401. Setelah login/logout, ambil token CSRF baru melalui `/me`.
- CORS hanya menerima origin eksplisit dari konfigurasi, dengan daftar method/header terbatas. Same-origin disarankan; wildcard dengan credentials tidak diizinkan.

## Bootstrap

Variabel: `TBCALL_BOOTSTRAP_EMAIL`/`TBCALL_BOOTSTRAP_PHONE` dan `TBCALL_BOOTSTRAP_PASSWORD`. Tanpa kredensial eksplisit tidak ada perubahan. Lock baris katalog SYSTEM_ADMIN menyerialkan pemeriksaan/pembuatan antar instance. Jika assignment SYSTEM_ADMIN sudah ada, tidak ada admin/kata sandi baru. Bootstrap tidak mengambil alih akun dengan email/telepon yang sudah dipakai. Identitas yang dikonfigurasi diverifikasi, akun ACTIVE, kata sandi dihash, peran serta audit dibuat dalam satu transaksi. Tidak ada logging secret.

## HTTP dan audit

Semua DTO eksplisit; entity JPA tidak diserialisasi. Respons `/me` hanya berisi identitas sendiri, peran/nama Indonesia, izin, fasilitas aktif, ringkasan link SELF dan ID kasus pendamping, tanpa field klinis atau hash.

`If-Match: "<version>"` wajib untuk mutation supporter dan update/revoke link pasien yang sudah ada. Create link baru tidak memerlukan precondition. Hilang: 428; malformed/wildcard/multiple: 400; stale: 409 `OPTIMISTIC_LOCK_CONFLICT`, tanpa retry diam-diam. Hibernate tetap memeriksa versi pada flush, termasuk bila dua request memiliki versi awal sama.

Errors memakai `application/problem+json`, judul/detail Indonesia dan `code` stabil. UUID `X-Request-ID` diterima jika formatnya valid; input lain diganti UUID baru. ID tersedia di respons/audit/MDC dan dibersihkan sesudah request. Payload/kata sandi/token tidak dimasukkan ke error, log, before/after data atau metadata audit.

Audit: USER_REGISTERED, CONTACT_VERIFIED, LOGIN_SUCCESS, LOGOUT, PATIENT_LINK_VERIFIED, PATIENT_LINK_REVOKED, SUPPORTER_LINKED, SUPPORTER_UNLINKED, BOOTSTRAP_ADMIN_CREATED; juga ROLE_ASSIGNED, ROLE_REMOVED, AUTHORIZATION_DENIED. Metadata hanya traceId. Audit mutation berhasil berada dalam transaksi command; denial disimpan dalam transaksi terpisah agar tidak hilang ketika command rollback.

## Sebelum deployment dan fase berikutnya

Phase 1.1 menambah administrasi fasyankes, lookup user exact/masked, penugasan fasyankes, peran global dan status akun. Update/deactivate fasyankes dan perubahan status wajib If-Match. Suspend/disable/reset password mencabut seluruh sesi dalam transaksi. Lock katalog SYSTEM_ADMIN lalu user mencegah kehilangan administrator aktif terverifikasi terakhir; lock facility lalu user melindungi membership/primary dan deactivation. Konsumsi/invalidation token mengambil lock user sebelum token. Audit baru tidak merekam identitas/token/password; metadata hanya traceId. Detail endpoint dan audit ada di [ADMINISTRATION.md](ADMINISTRATION.md) dan [ACCOUNT_RECOVERY.md](ACCOUNT_RECOVERY.md).

Deployment production perlu TLS, origin yang benar, secret bootstrap terlindungi dan adapter delivery nyata. Edge/distributed rate limiting wajib sebelum akses internet publik; checkpoint ini tidak memperkenalkan model trust client-IP atau limiter lokal. Scope regional, DTO klinis, resource-level clinical authorization dan kontrak write-back SITB hanya dibangun pada fase yang memang mengizinkannya. Phase 2 belum dimulai.
