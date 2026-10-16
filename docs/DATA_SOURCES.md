# Data sources and terminology

## Clinical guidance and TBCall vocabulary

TBCall uses Indonesian Ministry of Health guidance as domain and workflow references. These documents do not specify an official SITB physical database or API. Table names, field names, UUIDs, enums and canonical reference codes in this repository are TBCall implementation choices.

| Reference used | Repository use |
| --- | --- |
| *Petunjuk Teknis SITB*, version 2 May 2021 | Original workflow/module terminology and the historical V2 reference baseline |
| *Penatalaksanaan Tuberkulosis Sensitif Obat di Indonesia*, 2025 | Updated treatment-history and outcome terminology; SO regimen concepts |
| *Penatalaksanaan TBC RO di Indonesia*, 2024 | Resistance classifications, examination terminology and RO/Hr drug/regimen concepts |
| *Tata Laksana Tuberkulosis Anak dan Remaja*, 2023 | Child/adolescent regimen concepts |
| *Tuberkulosis dengan Komorbid*, 2025 | Additional-condition and observation concepts |

Source PDFs are kept locally under ignored `docs/reference-local/`, not redistributed or required to build. References are recorded here as the editions used for implementation, not a claim that every clinical rule or later guideline amendment has been incorporated.

[V2](../src/main/resources/db/migration/V2__reference_data.sql) is a historical baseline. [V3](../src/main/resources/db/migration/V3__align_reference_data_with_current_guidelines.sql), [V4](../src/main/resources/db/migration/V4__clinical_model_extensions.sql) and [V5](../src/main/resources/db/migration/V5__clinical_catalogs.sql) add or update TBCall reference concepts. Legacy values are retained for historical records rather than silently relabeled or remapped.

Examples such as `TB_SO`, `TB_RO`, `SO_6M_2HRZE_4HR` and `RIWAYAT_PENGOBATAN_SEBELUMNYA` are TBCall canonical identifiers, even when their labels reflect national terminology. Drug and regimen catalogue entries do not prescribe doses, establish eligibility or interpret laboratory results. Case completion is not treatment success, and a reminder status is not adherence evidence. Clinical use requires qualified professional review.

## Geographic reporting identities

[V19](../src/main/resources/db/migration/V19__geographic_reporting.sql) records catalogue `KEMENDAGRI_2025_2138_AMENDED_2430`: 38 provinces and 514 kabupaten/kota from Kepmendagri No. 300.2.2-2138 Tahun 2025, as amended by No. 300.2.2-2430 Tahun 2025. Its stored effective date is 23 June 2025; the recorded source check is 13 October 2026.

The migration retains official source URLs, document SHA-256 checksums, an entry checksum and explicit parent relationships. Codes are exact Kemendagri strings. Missing or unverified facility assignments are data-quality limitations, not guessed geographic matches. Reporting grants are validated against this catalogue; polygon boundaries never authorize access.

## Indicative map geometry

The map uses **HDX COD-AB v01**, attributed to **Badan Pusat Statistik and OCHA ROAP-FIS-HDX**, valid 1 April 2020, under [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/legalcode). See the [HDX dataset](https://data.humdata.org/dataset/cod-ab-idn) and the shipped [provenance manifest](../frontend/public/geography/hdx-2020/provenance.json) for source archive URL, checksum, attribution, transformations and asset hashes. No endorsement is implied.

TBCall transformed the source through explicit BPS-2020-to-Kemendagri-2025 mapping, three zero-displacement self-touch repairs, topology-preserving simplification, rounding, province dissolution and TopoJSON encoding. Islands and holes are retained. Eight named nonadministrative lake/reservoir/forest features remain unassigned; their areas were not guessed or filled. Current 38-province shapes are reconstructed from explicitly mapped district parents, not treated as original 2020 provincial divisions.

The [mapping ledger](../test-support/reporting/geography/mappings.json) and [validation data](../test-support/reporting/geography/validation.json) document all 514 administrative identities, Papua recodings and source limitations. Qualification is `PROTOTYPE_VERIFIED`, with `PRODUCTION_UNVERIFIED` explicitly retained. There is no claim of a successful live BPS bridging response, legal boundary accuracy or a certified gap-free land surface. The 519-feature geoBoundaries ADM2 derivative is not the shipped source.

The offline reproduction scripts are [build.py](../test-support/reporting/geography/build.py) and [package.py](../test-support/reporting/geography/package.py). Their pinned optional tools are in [requirements.txt](../test-support/reporting/geography/requirements.txt); input hashes must match the mapping ledger. Use new output directories and review validation before replacing public assets. Neither script downloads data or reads clinical records.

## Public statistics and private reporting

The public landing page uses the **2024 Central Java** dataset *Jumlah Penemuan dan Pengobatan Kasus TBC*, published by Dinas Kesehatan Provinsi Jawa Tengah on [the provincial open-data portal](https://data.jatengprov.go.id/id/dataset/c20-jumlah-penemuan-dan-pengobatan-kasus-tbc). Its recorded licence is Creative Commons Attribution. The [embedded source metadata and 35 district/city rows](../frontend/features/public/tb-statistics-data.ts) use only `jumlah_penemuan_kasus`; treatment success, estimated cases, trends and population-adjusted rates are not inferred.

Authenticated program reporting is a separate dataset: published aggregates of records held by TBCall. It is not an official SITB feed or Indonesian national TBC surveillance total. No patient information or clinical aggregate values are embedded in public geographic assets.
