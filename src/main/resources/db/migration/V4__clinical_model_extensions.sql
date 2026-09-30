-- TBCall model extensions approved in Domain / Schema v1.1.
CREATE TABLE drug_resistance_patterns (
    code varchar(30) PRIMARY KEY,
    name varchar(200) NOT NULL,
    description text,
    active boolean NOT NULL DEFAULT true
);

INSERT INTO drug_resistance_patterns (code, name, description) VALUES
    ('TB_SO', 'TBC Sensitif Obat (TBC SO)', 'Sensitif terhadap rifampisin dan isoniazid, tanpa resistansi OAT lain.'),
    ('TB_HR', 'TBC Sensitif Rifampisin, Resistan Isoniazid (TBC Hr)', 'Resistan isoniazid, tetapi sensitif rifampisin.'),
    ('TB_RR', 'TBC Resistan Rifampisin (TBC RR)', 'Resistan rifampisin, dengan atau tanpa resistansi terhadap OAT lain.'),
    ('TB_MDR', 'TBC Multidrug-Resistant (TBC MDR)', 'Resistan setidaknya terhadap rifampisin dan isoniazid.'),
    ('TB_PRE_XDR', 'TBC Pre-Extensively Drug-Resistant (TBC pre-XDR)', 'TBC MDR/RR dengan resistansi terhadap fluorokuinolon.'),
    ('TB_XDR', 'TBC Extensively Drug-Resistant (TBC XDR)', 'TBC MDR/RR dengan resistansi terhadap fluorokuinolon dan setidaknya bedaquiline atau linezolid.');

ALTER TABLE tb_cases ADD COLUMN drug_resistance_pattern_code varchar(30)
    REFERENCES drug_resistance_patterns(code);
CREATE INDEX idx_tb_cases_resistance_pattern ON tb_cases(drug_resistance_pattern_code);

CREATE TABLE additional_condition_types (
    code varchar(60) PRIMARY KEY,
    name varchar(200) NOT NULL,
    description text,
    active boolean NOT NULL DEFAULT true
);
INSERT INTO additional_condition_types (code, name) VALUES
    ('KURANG_GIZI', 'Kurang gizi'),
    ('MEROKOK', 'Merokok'),
    ('TERPAPAR_ASAP_ROKOK', 'Terpapar asap rokok'),
    ('GANGGUAN_KESEHATAN_MENTAL', 'Gangguan kesehatan mental'),
    ('HEPATITIS', 'Hepatitis'),
    ('PENYAKIT_PERNAPASAN_KRONIS', 'Penyakit pernapasan kronis'),
    ('GANGGUAN_GINJAL', 'Gangguan ginjal'),
    ('GANGGUAN_IMUNITAS_LAIN', 'Gangguan imunitas lain'),
    ('COVID_19', 'COVID-19');

CREATE TABLE case_condition_observations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES tb_cases(id),
    condition_type_code varchar(60) NOT NULL REFERENCES additional_condition_types(code),
    status_code varchar(20) NOT NULL CONSTRAINT chk_case_condition_status
        CHECK (status_code IN ('PRESENT', 'ABSENT', 'UNKNOWN')),
    classification_code varchar(100),
    observed_at timestamptz NOT NULL,
    source varchar(60),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_case_condition_observations_history
    ON case_condition_observations(case_id, condition_type_code, observed_at DESC);
CREATE TRIGGER trg_case_condition_observations_updated_at
    BEFORE UPDATE ON case_condition_observations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
