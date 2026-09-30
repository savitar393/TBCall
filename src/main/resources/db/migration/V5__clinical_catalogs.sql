-- Approved TBCall drug/regimen identifiers, not external codes.
-- Generic drug concepts only; formulation, strength, dose and eligibility are not inferred.
INSERT INTO drugs (code, name) VALUES
    ('H', 'Isoniazid'), ('R', 'Rifampisin'), ('Z', 'Pirazinamid'), ('E', 'Etambutol'),
    ('P', 'Rifapentine'), ('MFX', 'Moksifloksasin'), ('LFX', 'Levofloksasin'),
    ('BDQ', 'Bedaquiline'), ('PA', 'Pretomanid'), ('LZD', 'Linezolid'),
    ('CFZ', 'Clofazimine'), ('CS', 'Sikloserin'), ('TRD', 'Terizidone'),
    ('DLM', 'Delamanid'), ('ETO', 'Etionamid'), ('PTO', 'Protionamid'),
    ('PAS', 'Asam para-aminosalisilat'), ('IPM_CLN', 'Imipenem-silastatin'),
    ('MPM', 'Meropenem'), ('AMK', 'Amikasin'), ('S', 'Streptomisin');

INSERT INTO regimens (code, name, regimen_kind, tb_case_category_code, description) VALUES
    ('SO_6M_2HRZE_4HR', 'Paduan OAT SO 6 bulan (2HRZE/4HR)', 'TB_TREATMENT', 'TB_SO', 'Acuan: petunjuk teknis TBC SO 2025.'),
    ('SO_4M_2HPMZ_2HPM', 'Paduan OAT SO 4 bulan (2HPMZ/2HPM)', 'TB_TREATMENT', 'TB_SO', 'Acuan: petunjuk teknis TBC SO 2025. M pada notasi paduan berarti moksifloksasin (kode obat TBCall MFX).'),
    ('SO_CHILD_6M_2RHZ_4RH', 'Paduan anak 2RHZ/4RH', 'TB_TREATMENT', 'TB_SO', 'Acuan: petunjuk teknis TBC anak dan remaja 2023.'),
    ('SO_CHILD_6M_2RHZE_4RH', 'Paduan anak/remaja 2RHZE/4RH', 'TB_TREATMENT', 'TB_SO', 'Acuan: petunjuk teknis TBC anak dan remaja 2023.'),
    ('SO_CHILD_12M_2RHZE_10RH', 'Paduan anak 2RHZE/10RH', 'TB_TREATMENT', 'TB_SO', 'Acuan: petunjuk teknis TBC anak dan remaja 2023.'),
    ('SO_CHILD_4M_2RHZ_2RH', 'Paduan jangka pendek anak 2RHZ/2RH', 'TB_TREATMENT', 'TB_SO', 'Acuan: petunjuk teknis TBC anak dan remaja 2023; TBC SO 2025.'),
    ('RO_HR_6RZE_LFX', 'Paduan TBC Hr 6 RZE-Lfx', 'TB_TREATMENT', 'TB_RO', 'Acuan: petunjuk teknis TBC RO 2024. Hr sensitif rifampisin, resistan isoniazid.'),
    ('RO_BPALM', 'Paduan BPaLM', 'TB_TREATMENT', 'TB_RO', 'Acuan: petunjuk teknis TBC RO 2024.'),
    ('RO_BPAL', 'Paduan BPaL', 'TB_TREATMENT', 'TB_RO', 'Acuan: petunjuk teknis TBC RO 2024.'),
    ('RO_9M_ETO', 'Paduan TBC RO 9 bulan variasi etionamid', 'TB_TREATMENT', 'TB_RO', 'Acuan: petunjuk teknis TBC RO 2024.'),
    ('RO_9M_LZD', 'Paduan TBC RO 9 bulan variasi linezolid', 'TB_TREATMENT', 'TB_RO', 'Acuan: petunjuk teknis TBC RO 2024.'),
    ('RO_LONG_INDIVIDUAL', 'Paduan TBC RO jangka panjang/individual', 'TB_TREATMENT', 'TB_RO', 'Acuan: petunjuk teknis TBC RO 2024. Komposisi ditentukan secara individual.');
-- No fixed regimen_drugs rows or effective dates: v1.1 approves catalog concepts,
-- not phase/composition/dosing contracts or national rollout dates.
