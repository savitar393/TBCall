-- TBCall canonical seed codes. These code strings are inferred for TBCall.
-- The 2021 SITB user manual documents the displayed concepts/workflows,
-- not SITB physical tables, API values, IDs, or canonical database codes.
-- No external_systems row is inserted: SITB access is not configured.

INSERT INTO facility_types (code, name) VALUES
    ('PUSKESMAS', 'Puskesmas'),
    ('RUMAH_SAKIT', 'Rumah sakit'),
    ('KLINIK', 'Klinik'),
    ('BALAI_PENGOBATAN', 'Balai pengobatan'),
    ('BP4_BBKPM_BKPM', 'BP4/BBKPM/BKPM'),
    ('LAPAS_RUTAN', 'Lapas/rutan'),
    ('PRAKTEK_DOKTER_MANDIRI', 'Praktek dokter mandiri');

INSERT INTO sex_codes (code, name) VALUES
    ('LAKI_LAKI', 'Laki-laki'),
    ('PEREMPUAN', 'Perempuan');

INSERT INTO tb_suspect_types (code, name) VALUES
    ('TB_SO', 'Terduga TB sensitif obat'),
    ('TB_RO', 'Terduga TB resistan obat');

INSERT INTO anatomical_sites (code, name) VALUES
    ('PARU', 'TBC paru'),
    ('EKSTRAPARU', 'TBC ekstraparu');

INSERT INTO diagnosis_types (code, name) VALUES
    ('BAKTERIOLOGIS', 'Terkonfirmasi bakteriologis'),
    ('KLINIS', 'Terdiagnosis klinis');

INSERT INTO previous_treatment_categories (code, name) VALUES
    ('BARU', 'Baru'),
    ('KAMBUH', 'Kambuh'),
    ('SETELAH_GAGAL_KAT_1', 'Diobati setelah gagal kategori 1'),
    ('SETELAH_GAGAL_KAT_2', 'Diobati setelah gagal kategori 2'),
    ('SETELAH_PUTUS_BEROBAT', 'Diobati setelah putus berobat'),
    ('HASIL_SEBELUMNYA_TIDAK_DIKETAHUI', 'Pernah diobati tidak diketahui hasilnya'),
    ('SETELAH_GAGAL_LINI_2', 'Diobati setelah gagal pengobatan lini 2'),
    ('TIDAK_DIKETAHUI', 'Tidak diketahui'),
    ('LAIN_LAIN', 'Lain-lain');

INSERT INTO hiv_statuses (code, name) VALUES
    ('NEGATIF', 'Negatif HIV'),
    ('POSITIF', 'Positif HIV'),
    ('TIDAK_DIKETAHUI', 'Tidak diketahui');

INSERT INTO dm_statuses (code, name) VALUES
    ('YA', 'Ya'),
    ('TIDAK', 'Tidak'),
    ('TIDAK_DIKETAHUI', 'Tidak diketahui');

INSERT INTO pregnancy_statuses (code, name) VALUES
    ('HAMIL', 'Hamil'),
    ('TIDAK_HAMIL', 'Tidak hamil'),
    ('TIDAK_TAHU', 'Tidak tahu');

INSERT INTO bcg_statuses (code, name) VALUES
    ('YA', 'Ya'),
    ('TIDAK', 'Tidak');

INSERT INTO tb_case_categories (code, name) VALUES
    ('TB_SO', 'Pasien TB sensitif obat'),
    ('TB_RO', 'Pasien TB resistan obat');

INSERT INTO lab_test_types (code, name) VALUES
    ('MIKROSKOPIS_BTA', 'Mikroskopis BTA'),
    ('TCM', 'Tes cepat molekuler (TCM)'),
    ('BIAKAN', 'Biakan'),
    ('UJI_KEPEKAAN', 'Uji kepekaan'),
    ('LPA_LINI_DUA', 'LPA lini dua');

INSERT INTO lab_request_reasons (code, name) VALUES
    ('DIAGNOSIS', 'Diagnosis'),
    ('FOLLOW_UP', 'Follow up');

INSERT INTO treatment_outcome_codes (code, name) VALUES
    ('GAGAL', 'Gagal'),
    ('MENINGGAL', 'Meninggal'),
    ('PUTUS_BEROBAT', 'Putus berobat');
