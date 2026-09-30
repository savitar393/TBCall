# Terminologi TBCall

## Batas bahasa

Nama tampilan referensi, peran, istilah klinis/program, laporan operasional, label antarmuka, serta pesan validasi untuk pengguna menggunakan bahasa Indonesia. Ikuti istilah Kemenkes/SITB; gunakan **TBC** pada label operasional TBCall. Judul dokumen resmi tetap mengikuti judul aslinya.

Nama kelas/metode/paket Java, tabel/kolom SQL, properti JSON/API, konfigurasi infrastruktur, dan log teknis menggunakan bahasa Inggris. Identitas teknis yang sudah ada tidak diganti hanya untuk menerjemahkan. Kode referensi Indonesia yang stabil tetap dipertahankan. Status internal seperti `ACTIVE`, `COMPLETED`, `CANCELLED`, `PRESENT`, `ABSENT`, dan `UNKNOWN` tetap berbahasa Inggris.

| Istilah tampilan | Konsep/identitas teknis TBCall |
|---|---|
| Terduga TBC | `TBRegistration` / `tb_registrations` |
| Pasien TBC | `Patient` / `patients`; identitas orang, dapat memiliki beberapa registrasi |
| Kasus TBC | `TBCase` / `tb_cases`; kasus terkonfirmasi dalam satu registrasi |
| Pengobatan | `Treatment` / `treatments`; episode pengobatan suatu kasus |
| TBC Sensitif Obat (TBC SO) | `TB_SO` |
| TBC Resistan Obat (TBC RO) | `TB_RO`; jalur program umum, bukan subtipe resistansi rinci |
| Lokasi Anatomi | `anatomical_sites` |
| Terkonfirmasi Bakteriologis | `BAKTERIOLOGIS` |
| Terdiagnosis Klinis | `KLINIS` |
| Paduan Pengobatan | `Regimen` / `regimens` |
| Hasil Akhir Pengobatan | `TreatmentOutcome` / `treatment_outcomes` |
| Pengobatan Lengkap | `PENGOBATAN_LENGKAP` |
| Investigasi Kontak | `ContactInvestigation` / `contact_investigations` |
| Terapi Pencegahan Tuberkulosis (TPT) | `PreventiveTreatment` / `preventive_treatments` |
| Pengawas Menelan Obat (PMO) | `TREATMENT_SUPPORTER`; akun pengguna terpisah dari identitas pasien |
| Fasilitas Pelayanan Kesehatan (Fasyankes) | `Facility` / `facilities` |
| Obat Anti Tuberkulosis (OAT) | `Drug` / `drugs` |
| Nomor Induk Kependudukan (NIK) | Identitas nasional; bukan primary key TBCall |
| Sistem Informasi Tuberkulosis (SITB) | Sumber klinis/program yang kelak otoritatif jika integrasi resmi tersedia |
| BPJS | Akronim nasional yang dipertahankan bila relevan |

Semua kode, tabel, kolom, UUID, dan pemetaan di atas adalah kontrak **TBCall**. Panduan SITB bukan spesifikasi fisik basis data atau API SITB. Tidak ada klaim bahwa kode TBCall adalah kode resmi SITB. UUID TBCall tetap menjadi primary key; identitas sumber eksternal disimpan terpisah.

## Catatan klinis dan sumber

Pedoman SITB 2021 dipakai untuk alur kerja, konsep entri data, batas modul, pemisahan tanggung jawab, dan bentuk interoperabilitas mendatang. Terminologi/semantik klinis terkini mengikuti petunjuk teknis SO 2025, RO 2024, Anak/Remaja 2023, dan Komorbid 2025. Daftar yang diimplementasikan disetujui dalam [Domain / Schema v1.1](architecture/TBCall_Domain_Schema_v1.1.md); rincian sumber dan daftar kode ada di [REFERENCE_DATA.md](../REFERENCE_DATA.md).

`Berhasil Diobati` adalah agregat jumlah `Sembuh` dan `Pengobatan Lengkap`, bukan hasil akhir individu tambahan. `TBC Hr` sensitif rifampisin tetapi resistan isoniazid. `P` dalam notasi paduan berarti rifapentine; `M` berarti moksifloksasin, yang menggunakan kode obat TBCall `MFX`. Paduan jangka panjang/individual tidak memiliki satu komposisi tetap.

Pesan pelanggaran integritas V6 menggunakan bahasa Indonesia. Penamaan constraint, trigger, kelas exception, dan log infrastruktur tetap teknis. Lapisan API mendatang perlu menerjemahkan kegagalan database ke pesan pengguna tanpa membocorkan rincian SQL atau data pasien.
