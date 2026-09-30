-- Approved TBCall v1.1 canonical codes; not SITB API/database values.
-- Current clinical terminology: national SO 2025 / RO 2024 guidance.
UPDATE treatment_outcome_codes SET name = 'Gagal Pengobatan' WHERE code = 'GAGAL';
INSERT INTO treatment_outcome_codes (code, name) VALUES
    ('SEMBUH', 'Sembuh'),
    ('PENGOBATAN_LENGKAP', 'Pengobatan Lengkap'),
    ('TIDAK_DAPAT_DIEVALUASI', 'Tidak Dapat Dievaluasi');
-- BERHASIL_DIOBATI is a reporting aggregate, not a terminal patient outcome.

INSERT INTO previous_treatment_categories (code, name) VALUES
    ('RIWAYAT_PENGOBATAN_SEBELUMNYA', 'Riwayat Pengobatan TBC Sebelumnya');
UPDATE previous_treatment_categories
SET active = false, description = 'Klasifikasi lama dari acuan SITB 2021; dipertahankan untuk data historis.'
WHERE code IN ('SETELAH_GAGAL_KAT_1', 'SETELAH_GAGAL_KAT_2', 'SETELAH_PUTUS_BEROBAT',
               'HASIL_SEBELUMNYA_TIDAK_DIKETAHUI', 'SETELAH_GAGAL_LINI_2', 'LAIN_LAIN');
UPDATE previous_treatment_categories
SET description = 'Nilai cadangan kualitas data/impor TBCall; bukan klasifikasi klinis terkini.'
WHERE code = 'TIDAK_DIKETAHUI';

INSERT INTO lab_test_types (code, name) VALUES
    ('LPA_LINI_SATU', 'LPA lini satu'),
    ('TCM_XDR', 'TCM XDR'),
    ('RONTGEN_TORAKS', 'Rontgen toraks'),
    ('HIV', 'Pemeriksaan HIV');

UPDATE tb_suspect_types SET name = 'Terduga TBC Sensitif Obat (TBC SO)' WHERE code = 'TB_SO';
UPDATE tb_suspect_types SET name = 'Terduga TBC Resistan Obat (TBC RO)' WHERE code = 'TB_RO';
UPDATE tb_case_categories SET name = 'Pasien TBC Sensitif Obat (TBC SO)' WHERE code = 'TB_SO';
UPDATE tb_case_categories SET name = 'Pasien TBC Resistan Obat (TBC RO)' WHERE code = 'TB_RO';
UPDATE facility_types SET name = 'Praktik dokter mandiri' WHERE code = 'PRAKTEK_DOKTER_MANDIRI';
UPDATE lab_request_reasons SET name = 'Tindak lanjut' WHERE code = 'FOLLOW_UP';
