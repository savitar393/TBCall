# Keamanan identitas — Application/API v1 Phase 1

Implementasi mengikuti [arsitektur yang disetujui](architecture/TBCall_Application_API_v1.md). V1–V8 tidak berubah; Flyway V9 menambah constraint kepemilikan tautan dan izin verifikasi bagi petugas TBC. Hibernate tetap `validate`.

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

Delivery sinkron dapat mendahului commit database; kegagalan commit menghasilkan token yang tidak dapat digunakan. Resend/outbox dan pengiriman background belum diimplementasikan dan harus ditetapkan saat adapter pengiriman nyata dibangun.

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

Deployment production perlu TLS, origin yang benar, secret bootstrap terlindungi dan adapter delivery nyata. Rate limiting, resend/reset password dan operasi admin/peran/fasilitas belum masuk Phase 1. Scope regional, DTO klinis dan kontrak write-back SITB hanya dibangun pada fase yang memang mengizinkannya.
