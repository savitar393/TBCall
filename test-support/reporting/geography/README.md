# Indicative reporting geometry

This developer-only pipeline does not access clinical data or determine access rights.
The 514 explicit relationships in `mappings.json` are qualified for a synthetic
prototype (`PROTOTYPE_VERIFIED`), separately from production qualification
(`PRODUCTION_UNVERIFIED`). Kemendagri V19 remains the reporting identity authority.
No successful live BPS bridging response is claimed.

## Reproduction

Use Python 3.12, NumPy 2.3.5 and Shapely 2.1.2 (GEOS 3.13.1). These are optional
development tools, not application dependencies. Acquire them separately. The
scripts never download anything. Obtain the pinned HDX archive at the resource URL
in `mappings.json`; extract `idn_admin2.geojson` and `idn_admin0.geojson` as
`hdx-adm2-original.geojson` and `hdx-adm0-original.geojson` into an ignored directory.
Both input hashes are checked before processing. Use **new**, absent output paths:

```powershell
python test-support/reporting/geography/build.py --source-dir .tools/geo-input --output .tools/geo-stage
python test-support/reporting/geography/package.py --stage .tools/geo-stage --output .tools/geo-output
python -m unittest discover -s test-support/reporting/geography -p "test_*.py" -v
```

Inspect the output validation before replacing public assets. The tracked
`validation.json` records the shipped assets and checksums. Build outputs from
another GEOS version are not automatically qualified. Do not run Python with `-O`:
assertions are part of this developer qualification tool.

## Qualification and limits

The HDX COD-AB v01 source is BPS/OCHA, valid 1 April 2020, CC BY 3.0 IGO.
Changes: three zero-displacement self-touch repairs (each separates one existing
self-touch into an interior ring, without moving its boundary), explicit code/parent mapping,
topology-preserving simplification, seven-decimal rounding, province dissolution
using current explicit parents, and fixed-point TopoJSON encoding. Every island
part and hole is retained. All 522 original features exactly equal the independent
source ADM0 outline. Eight explicitly named lake/reservoir/forest features are
excluded from administrative attribution; their holes are **not** filled. Thus
514 administrative identities are covered, not a certified continuous legal land
surface. Differences are measured in angular coordinate units, not legal distances.

The 38 reconstructed provinces equal the district union before additional
national-display simplification. That separately validated display layer preserves
parts/holes but is not bit-identical to the detailed district union. District assets
load by province. TopoJSON uses one closed ring per delta arc; no shared-arc size
reduction is claimed. The client accepts only the declared fixed precision.

The geoBoundaries ADM2 set of 519 is not used: it combines four HDX generic `Danau`
features into one multipart feature; together with four other nonadministrative
features, this explains its five extras over 514. The original HDX set has 522.
The historical 34-province polygons are not reused: current 38 parents come from V19.

Matching is explicit and reviewed, not inferred from code prefixes or similar names.
The 26 Papua recodings cite the four 2022 formation laws. Wrapped/renamed/abbreviated
labels and the historical Palembang/Sorong reference limitations are retained per row.
Indicative 2020 geometry does not certify current legal boundary alignment. Production
use needs renewed geographic, privacy and institutional review.

Public geometry contains only canonical code, name and parent. Counts come only
from the authorized published-report APIs and are never embedded in map assets.
