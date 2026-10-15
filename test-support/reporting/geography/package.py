"""Qualify a national display layer and losslessly delta-encode seven-decimal geometry."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import mapping, shape

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stage', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True, help='New output directory; existing outputs refused')
args = parser.parse_args()
STAGE, OUT = args.stage, args.output
OUT.mkdir(parents=True, exist_ok=False)
report = json.loads((STAGE / 'validation.json').read_text())
national = json.loads((STAGE / 'provinces.json').read_text(encoding='utf-8'))
original = [shape(f['geometry']) for f in national['features']]

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


def counts(g):
    parts = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
    return len(parts), sum(len(p.interiors) for p in parts)

tolerance = 0.003
for attempt in range(20):
    candidate = shapely.coverage_simplify(original, tolerance)
    candidate = shapely.transform(candidate, lambda coordinates: np.round(coordinates, 7))
    changes = [a.symmetric_difference(b).area / a.area for a, b in zip(original, candidate)]
    if shapely.is_valid(candidate).all() and shapely.coverage_is_valid(candidate) and max(changes) < 0.009 and all(counts(a) == counts(b) for a, b in zip(original, candidate)):
        break
    tolerance /= 2
else:
    raise ValueError('Unable to qualify national display simplification')
deviations = [max(distance_to_boundary(np.concatenate(list(rings(a))), b), distance_to_boundary(np.concatenate(list(rings(b))), a)) for a, b in zip(original, candidate)]
assert max(deviations) < 0.03, max(deviations)
for f, g in zip(national['features'], candidate):
    f['geometry'] = mapping(g)
print('National display tolerance', tolerance, 'max relative difference', max(changes), 'vertices', int(shapely.get_num_coordinates(candidate).sum()), flush=True)

def encode(collection):
    arcs, geometries = [], []
    def ring(points):
        index = len(arcs)
        x, y = 0, 0
        encoded = []
        for lon, lat in points:
            nx, ny = round(lon * 1e7), round(lat * 1e7)
            encoded.append([nx - x, ny - y])
            x, y = nx, ny
        # Fixed seven-decimal quantization is already validated before encoding.
        assert encoded and sum(p[0] for p in encoded) == round(points[0][0] * 1e7)
        arcs.append(encoded)
        return [index]
    for f in collection['features']:
        g = f['geometry']
        references = [ring(r) for r in g['coordinates']] if g['type'] == 'Polygon' else [[ring(r) for r in polygon] for polygon in g['coordinates']]
        geometries.append({'type': g['type'], 'properties': f['properties'], 'arcs': references})
    return {'type': 'Topology', 'transform': {'scale': [1e-7, 1e-7], 'translate': [0, 0]}, 'objects': {'regions': {'type': 'GeometryCollection', 'geometries': geometries}}, 'arcs': arcs}

def decode(topology):
    arcs = []
    for arc in topology['arcs']:
        x, y = 0, 0
        points = []
        for dx, dy in arc:
            x, y = x + dx, y + dy
            points.append([x / 1e7, y / 1e7])
        arcs.append(points)
    features = []
    for g in topology['objects']['regions']['geometries']:
        coordinates = [arcs[refs[0]] for refs in g['arcs']] if g['type'] == 'Polygon' else [[arcs[refs[0]] for refs in polygon] for polygon in g['arcs']]
        features.append({'type': 'Feature', 'properties': g['properties'], 'geometry': {'type': g['type'], 'coordinates': coordinates}})
    return features

assets = []
for name in [*sorted(a['file'] for a in report['assets'] if a['file'] != 'provinces.json'), 'provinces.json']:
    collection = national if name == 'provinces.json' else json.loads((STAGE / name).read_text(encoding='utf-8'))
    encoded = encode(collection)
    decoded = decode(encoded)
    a, b = [shape(f['geometry']) for f in collection['features']], [shape(f['geometry']) for f in decoded]
    assert all(x.equals_exact(y, 0) for x, y in zip(a, b))
    assert shapely.is_valid(b).all() and shapely.coverage_is_valid(b)
    data = json.dumps(encoded, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    filename = name.replace('.json', '.topo.json')
    (OUT / filename).write_bytes(data)
    assets.append({'file': filename, 'bytes': len(data), 'gzipBytes': len(gzip.compress(data, mtime=0)), 'sha256': hashlib.sha256(data).hexdigest()})
report['assets'] = assets
report['nationalDisplay'] = {'toleranceDegrees': tolerance, 'maximumDiscreteBoundaryHausdorffDegrees': max(deviations), 'maximumRelativeSymmetricDifference': max(changes), 'allPartAndHoleCountsPreserved': True, 'vertices': int(shapely.get_num_coordinates(candidate).sum()), 'coverageValid': True, 'note': 'Province reconstruction exactly equals the district union BEFORE this separately measured national-display generalization. All 38 identities are retained.'}
report['encoding'] = {'format': 'TopoJSON', 'scale': [1e-7, 1e-7], 'translate': [0, 0], 'losslessAfterValidatedRounding': True, 'arcLayout': 'one closed ring per arc; fixed-point delta encoding, no further coordinate loss', 'specification': 'https://github.com/topojson/topojson-specification'}

(OUT / 'validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'assets': len(assets), 'totalBytes': sum(a['bytes'] for a in assets), 'national': assets[-1]}, indent=2), flush=True)
