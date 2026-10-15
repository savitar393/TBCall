"""Offline, source-pinned cartographic build. No network access or application data."""
import argparse
import re
import collections
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import mapping, shape

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir', type=Path, required=True, help='Directory containing original HDX ADM2 and ADM0 GeoJSON')
parser.add_argument('--output', type=Path, required=True, help='New staging directory; existing outputs are refused')
args = parser.parse_args()
ROOT, OUT = args.source_dir, args.output
OUT.mkdir(parents=True, exist_ok=False)
ledger = json.loads((HERE / 'mappings.json').read_text(encoding='utf-8'))
assert hashlib.sha256((ROOT / 'hdx-adm2-original.geojson').read_bytes()).hexdigest() == ledger['sources']['hdx']['sha256']
assert hashlib.sha256((ROOT / 'hdx-adm0-original.geojson').read_bytes()).hexdigest() == 'f28232ab0d0161f46b58e2ca93c61732658459067f92bef7a721fce2a1b03b83'
assert len(ledger['relationships']) == 514
assert all(r['prototypeStatus'] == 'PROTOTYPE_VERIFIED' and r['productionStatus'] == 'PRODUCTION_UNVERIFIED' for r in ledger['relationships'])
sql = (REPO / 'src/main/resources/db/migration/V19__geographic_reporting.sql').read_text(encoding='utf-8')
rows = re.findall(r"\('KEMENDAGRI_2025_2138_AMENDED_2430','([^']+)','(PROVINCE|REGENCY)','((?:[^']|'')+)',(NULL|'[^']+'),(?:NULL|'PROVINCE')\)", sql)
catalogue = {code: {'name': name.replace("''", "'"), 'parent': None if parent == 'NULL' else parent[1:-1], 'level': level} for code, level, name, parent in rows}
assert len(catalogue) == 552
for r in ledger['relationships']:
    assert catalogue[r['kemendagri2025Code']] == {'name': r['kemendagri2025Name'], 'parent': r['provinceCode'], 'level': 'REGENCY'}
started = time.monotonic()
source = json.loads((ROOT / 'hdx-adm2-original.geojson').read_text(encoding='utf-8'))
relations = ledger['relationships']
by_source = {r['sourcePcode']: r for r in relations}
features = sorted((f for f in source['features'] if f['properties']['adm2_pcode'] in by_source), key=lambda f: by_source[f['properties']['adm2_pcode']]['kemendagri2025Code'])
assert len(features) == 514
assert source['crs']['properties']['name'] in ['urn:ogc:def:crs:OGC:1.3:CRS84', 'urn:ogc:def:crs:EPSG::4326']
geoms, repairs = [], []
for feature in features:
    g = shape(feature['geometry'])
    if not g.is_valid:
        repaired = shapely.make_valid(g)
        assert repaired.geom_type == g.geom_type == 'Polygon'
        assert shapely.hausdorff_distance(g.boundary, repaired.boundary) == 0
        assert abs(g.area - repaired.area) < 1e-12
        repairs.append(feature['properties']['adm2_pcode'])
        g = repaired
    geoms.append(g)
assert repairs == ['ID1407', 'ID1708', 'ID3305'], repairs
assert shapely.coverage_is_valid(geoms)
print('PASS: source validity, three zero-displacement ring repairs, valid nonoverlapping coverage', flush=True)
# Simplify connected polygon components together so shared edges stay identical.
# Isolated islands receive their own measured tolerance, rather than forcing a
# nationwide tolerance that retains millions of unnecessary coastal vertices.
parts, owners = [], []
for owner, g in enumerate(geoms):
    for part in g.geoms if g.geom_type == 'MultiPolygon' else [g]:
        parts.append(part)
        owners.append(owner)
parents = list(range(len(parts)))
def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i
tree = shapely.STRtree(parts)
first_owner = {}
for i, owner in enumerate(owners):
    if owner in first_owner:
        parents[find(i)] = find(first_owner[owner])
    else:
        first_owner[owner] = i
for i, part in enumerate(parts):
    # Nearby coasts may interact during simplification. Group them before
    # simplifying; final measured displacement must be below half this gap.
    for j in tree.query(part, predicate='dwithin', distance=0.02):
        a, b = find(i), find(int(j))
        if a != b:
            parents[b] = a
components = collections.defaultdict(list)
for i in range(len(parts)):
    components[find(i)].append(i)
print('Connected coverage components', len(components), flush=True)
simplified_parts = [None] * len(parts)
tolerances = []
for ids in components.values():
    originals = [parts[i] for i in ids]
    tolerance = 0.0005
    region_ids = sorted({owners[i] for i in ids})
    for attempt in range(24):
        candidate = shapely.coverage_simplify(originals, tolerance, simplify_boundary=True)
        candidates_by_region = {owner: [g for i, g in zip(ids, candidate) if owners[i] == owner] for owner in region_ids}
        proposed = [shapely.multipolygons(candidates_by_region[owner]) if geoms[owner].geom_type == 'MultiPolygon' else candidates_by_region[owner][0] for owner in region_ids]
        if all(len(a.interiors) == len(b.interiors) for a, b in zip(originals, candidate)) and all(g.is_valid and geoms[owner].symmetric_difference(g).area / geoms[owner].area < 0.009 for owner, g in zip(region_ids, proposed)):
            break
        tolerance /= 2
    else:
        raise ValueError('Unable to simplify component within declared area bound')
    tolerances.append(tolerance)
    for i, g in zip(ids, candidate):
        simplified_parts[i] = g
simple = []
for owner, original in enumerate(geoms):
    own = [g for i, g in zip(owners, simplified_parts) if i == owner]
    simple.append(shapely.multipolygons(own) if original.geom_type == 'MultiPolygon' else own[0])
simple = shapely.transform(simple, lambda coordinates: np.round(coordinates, 7))
assert shapely.is_valid(simple).all()
assert shapely.coverage_is_valid(simple)
print('PASS: simplified coverage validity', flush=True)

def rings(g):
    for part in g.geoms if g.geom_type == 'MultiPolygon' else [g]:
        yield np.asarray(part.exterior.coords)
        for hole in part.interiors:
            yield np.asarray(hole.coords)

def distance_to_boundary(coordinates, target):
    # Same vertex-to-segment discrete measure as default GEOS Hausdorff,
    # indexed to avoid a quadratic scan of millions of source vertices.
    segments = np.concatenate([np.stack([r[:-1], r[1:]], axis=1) for r in rings(target)])
    index = shapely.STRtree(shapely.linestrings(segments))
    _, distances = index.query_nearest(shapely.points(coordinates), return_distance=True, all_matches=False)
    return float(distances.max())

statistics = []
for feature, original, simplified in zip(features, geoms, simple):
    before, after = list(rings(original)), list(rings(simplified))
    parts = lambda g: len(g.geoms) if g.geom_type == 'MultiPolygon' else 1
    assert parts(original) == parts(simplified), feature['properties']
    assert len(before) == len(after), feature['properties']
    deviation = max(distance_to_boundary(np.concatenate(before), simplified), distance_to_boundary(np.concatenate(after), original))
    relative = original.symmetric_difference(simplified).area / original.area
    statistics.append({'pcode': feature['properties']['adm2_pcode'], 'discreteBoundaryHausdorffDegrees': deviation, 'relativeSymmetricDifference': relative})
    assert deviation < 0.01, statistics[-1]
    assert relative < 0.01, statistics[-1]
print('PASS: all island parts and holes retained; per-feature area/deviation bounds', flush=True)

def compact_write(name, obj):
    data = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    (OUT / name).write_bytes(data)
    return {'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

province_names = {code: row['name'] for code, row in catalogue.items() if row['level'] == 'PROVINCE'}
assert len(province_names) == 38
grouped = collections.defaultdict(list)
for feature, g in zip(features, simple):
    relation = by_source[feature['properties']['adm2_pcode']]
    grouped[relation['provinceCode']].append({'type': 'Feature', 'properties': {'code': relation['kemendagri2025Code'], 'name': relation['kemendagri2025Name'], 'parent': relation['provinceCode']}, 'geometry': mapping(g)})
assert set(grouped) == set(province_names)
provinces, assets = [], []
for code, children in sorted(grouped.items()):
    province = shapely.union_all([shape(f['geometry']) for f in children])
    assert province.is_valid
    provinces.append({'type': 'Feature', 'properties': {'code': code, 'name': province_names[code], 'parent': None}, 'geometry': mapping(province)})
    assets.append(compact_write(code + '.json', {'type': 'FeatureCollection', 'features': children}))
assert shapely.coverage_is_valid([shape(f['geometry']) for f in provinces])
assert shapely.union_all([shape(f['geometry']) for f in provinces]).equals(shapely.union_all(simple))
assets.append(compact_write('provinces.json', {'type': 'FeatureCollection', 'features': provinces}))
excluded = [{'pcode': f['properties']['adm2_pcode'], 'name': f['properties']['adm2_name'], 'sourceParent': f['properties']['adm1_pcode']} for f in source['features'] if f['properties']['adm2_pcode'] not in by_source]
assert {f['pcode'] for f in excluded} == {'ID1388','ID1688','ID1888','ID7188','ID1288','ID3399','ID3288','ID3388'}
report = {'toolchain': {'shapely': shapely.__version__, 'GEOS': shapely.geos_version_string}, 'crs': source['crs'], 'sourceSha256': hashlib.sha256((ROOT / 'hdx-adm2-original.geojson').read_bytes()).hexdigest(), 'sourceAdministrativeFeatures': 514, 'provinceFeatures': 38, 'sourceVertices': int(shapely.get_num_coordinates(geoms).sum()), 'simplifiedVertices': int(shapely.get_num_coordinates(simple).sum()), 'polygonParts': sum(len(g.geoms) if g.geom_type == 'MultiPolygon' else 1 for g in simple), 'ringRepairs': repairs, 'positiveAreaOverlaps': 0, 'coverageValid': True, 'provinceUnionEqualsDistrictUnion': True, 'excludedSourceFeatures': excluded, 'exclusionsNote': 'Eight explicitly named nonadministrative water/forest features are not assigned to a district. Their footprint remains outside the derived administrative coverage; no missing area is guessed or filled.', 'simplification': {'algorithm': 'GEOS coverage Visvalingam-Whyatt per nearby connected coverage group, retaining every region and island; halve scalar tolerance until each administrative unit has <0.9% symmetric area difference and retained holes', 'maximumToleranceDegrees': max(tolerances), 'roundingDecimals': 7, 'maximumDiscreteBoundaryHausdorffDegrees': max(v['discreteBoundaryHausdorffDegrees'] for v in statistics), 'maximumRelativeSymmetricDifference': max(v['relativeSymmetricDifference'] for v in statistics), 'allMultipartAndHoleCountsPreserved': True, 'perFeature': statistics}, 'assets': assets, 'elapsedSeconds': round(time.monotonic() - started, 2)}
report['ringCount'] = sum(len(list(rings(g))) for g in simple)
report['catalogueVersion'] = ledger['catalogueVersion']
report['mappingSha256'] = hashlib.sha256((HERE / 'mappings.json').read_bytes()).hexdigest()
# Independent source-level national coverage proof, including explicit exclusions.
country = json.loads((ROOT / 'hdx-adm0-original.geojson').read_text(encoding='utf-8'))
country_shape = shapely.union_all([shape(f['geometry']) for f in country['features']])
all_source = shapely.union_all([shapely.make_valid(shape(f['geometry'])) for f in source['features']])
assert country_shape.is_valid and all_source.is_valid and all_source.equals(country_shape)
report['countryCoverage'] = {'exactUnionEqualsSourceCountry': True, 'missingAreaDegrees2': 0, 'outsideAreaDegrees2': 0, 'knownExcludedFeatureCount': 8, 'sourceSha256': hashlib.sha256((ROOT / 'hdx-adm0-original.geojson').read_bytes()).hexdigest(), 'note': 'All 522 source features equal the source national outline; the eight named exclusions remain unassigned. Angular-coordinate measures are not land-area claims.'}
(OUT / 'validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k not in ['assets', 'simplification']}, indent=2), flush=True)
print('Total static geometry bytes', sum(a['bytes'] for a in assets), flush=True)
