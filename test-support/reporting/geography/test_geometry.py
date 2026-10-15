"""Offline qualification of shipped public assets; no server/database/network."""
import hashlib
import json
import re
import unittest
from pathlib import Path

import shapely
from shapely.geometry import shape

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PUBLIC = REPO / 'frontend/public/geography/hdx-2020'


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def decode(data):
    assert data['type'] == 'Topology'
    assert data['transform'] == {'scale': [1e-7, 1e-7], 'translate': [0, 0]}
    arcs = []
    for encoded in data['arcs']:
        x = y = 0
        points = []
        for dx, dy in encoded:
            x, y = x + dx, y + dy
            points.append([x / 1e7, y / 1e7])
        assert len(points) >= 4 and points[0] == points[-1]
        arcs.append(points)
    features = []
    for g in data['objects']['regions']['geometries']:
        assert set(g) == {'type', 'properties', 'arcs'}
        assert set(g['properties']) == {'code', 'name', 'parent'}
        def ring(ref):
            assert len(ref) == 1 and 0 <= ref[0] < len(arcs)
            return arcs[ref[0]]
        coordinates = [ring(r) for r in g['arcs']] if g['type'] == 'Polygon' else [[ring(r) for r in p] for p in g['arcs']]
        features.append((g['properties'], shape({'type': g['type'], 'coordinates': coordinates})))
    return features


class GeometryQualification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ledger = load(HERE / 'mappings.json')
        cls.validation = load(HERE / 'validation.json')
        cls.provinces = decode(load(PUBLIC / 'provinces.topo.json'))
        cls.districts = []
        for path in sorted(PUBLIC.glob('*.topo.json')):
            if path.name != 'provinces.topo.json':
                cls.districts.extend(decode(load(path)))
        sql = (REPO / 'src/main/resources/db/migration/V19__geographic_reporting.sql').read_text(encoding='utf-8')
        rows = re.findall(r"\('KEMENDAGRI_2025_2138_AMENDED_2430','([^']+)','(PROVINCE|REGENCY)','((?:[^']|'')+)',(NULL|'[^']+'),(?:NULL|'PROVINCE')\)", sql)
        cls.catalogue = {c: {'code': c, 'name': n.replace("''", "'"), 'parent': None if p == 'NULL' else p[1:-1]} for c, _, n, p in rows}

    def test_complete_exact_catalogue_identity_and_explicit_parents(self):
        self.assertEqual(len(self.provinces), 38)
        self.assertEqual(len(self.districts), 514)
        features = self.provinces + self.districts
        self.assertEqual(len({p['code'] for p, _ in features}), 552)
        self.assertEqual({p['code']: p for p, _ in features}, self.catalogue)
        index = load(REPO / 'frontend/features/program-reports/geometry-index.json')
        self.assertEqual({p['code']: p for p in index['regions']}, self.catalogue)

    def test_explicit_mapping_is_bijective_and_prototype_only(self):
        rows = self.ledger['relationships']
        self.assertEqual(len(rows), 514)
        self.assertEqual(len({r['sourcePcode'] for r in rows}), 514)
        self.assertEqual(len({r['kemendagri2025Code'] for r in rows}), 514)
        for r in rows:
            self.assertEqual(r['prototypeStatus'], 'PROTOTYPE_VERIFIED')
            self.assertEqual(r['productionStatus'], 'PRODUCTION_UNVERIFIED')
            self.assertTrue(r['rationale'] and r['sources'])
            self.assertTrue(all(source in self.ledger['sources'] for source in r['sources']))
            self.assertEqual(self.catalogue[r['kemendagri2025Code']], {'code': r['kemendagri2025Code'], 'name': r['kemendagri2025Name'], 'parent': r['provinceCode']})
        self.assertEqual(sum(r['historicalDagriCode'] != r['kemendagri2025Code'] for r in rows), 26)

    def test_valid_nonoverlapping_district_and_province_coverage(self):
        for features in [self.provinces, self.districts]:
            geoms = [g for _, g in features]
            self.assertTrue(shapely.is_valid(geoms).all())
            self.assertTrue(shapely.coverage_is_valid(geoms))
            bounds = shapely.total_bounds(geoms)
            self.assertTrue(94 < bounds[0] < 96 and -12 < bounds[1] < -10)
            self.assertTrue(140 < bounds[2] < 142 and 5 < bounds[3] < 7)

    def test_all_islands_and_holes_retained(self):
        geoms = [g for _, g in self.districts]
        parts = [p for g in geoms for p in (g.geoms if g.geom_type == 'MultiPolygon' else [g])]
        self.assertEqual(len(parts), 8570)
        self.assertEqual(sum(1 + len(p.interiors) for p in parts), 8617)
        self.assertEqual(self.validation['polygonParts'], 8570)
        self.assertEqual(self.validation['ringCount'], 8617)

    def test_measured_simplification_and_national_display_limits(self):
        detail = self.validation['simplification']
        self.assertEqual(len(detail['perFeature']), 514)
        self.assertTrue(detail['allMultipartAndHoleCountsPreserved'])
        self.assertLess(detail['maximumRelativeSymmetricDifference'], .01)
        self.assertLess(detail['maximumDiscreteBoundaryHausdorffDegrees'], .01)
        self.assertTrue(self.validation['provinceUnionEqualsDistrictUnion'])
        national = self.validation['nationalDisplay']
        self.assertLess(national['maximumDiscreteBoundaryHausdorffDegrees'], .03)
        self.assertTrue(national['allPartAndHoleCountsPreserved'])
        for props, display in self.provinces:
            reconstructed = shapely.union_all([g for p, g in self.districts if p['parent'] == props['code']])
            self.assertTrue(reconstructed.is_valid)
            self.assertLess(reconstructed.symmetric_difference(display).area / reconstructed.area, .009)
            self.assertTrue(display.geom_type in ['Polygon', 'MultiPolygon'])

    def test_explicit_exclusions_and_country_source_proof(self):
        self.assertEqual({r['pcode'] for r in self.validation['excludedSourceFeatures']}, {'ID1388','ID1688','ID1888','ID7188','ID1288','ID3399','ID3288','ID3388'})
        self.assertTrue(self.validation['countryCoverage']['exactUnionEqualsSourceCountry'])
        self.assertEqual(self.validation['countryCoverage']['missingAreaDegrees2'], 0)
        self.assertEqual(self.validation['ringRepairs'], ['ID1407', 'ID1708', 'ID3305'])

    def test_published_bytes_and_mapping_pin(self):
        assets = self.validation['assets']
        self.assertEqual(len(assets), 39)
        self.assertEqual({a['file'] for a in assets}, {p.name for p in PUBLIC.glob('*.topo.json')})
        for asset in assets:
            data = (PUBLIC / asset['file']).read_bytes()
            self.assertEqual(len(data), asset['bytes'])
            self.assertEqual(hashlib.sha256(data).hexdigest(), asset['sha256'])
        self.assertEqual(hashlib.sha256((HERE / 'mappings.json').read_bytes()).hexdigest(), self.validation['mappingSha256'])
        self.assertEqual(self.validation['sourceSha256'], self.ledger['sources']['hdx']['sha256'])

    def test_provenance_and_no_clinical_properties(self):
        provenance = load(PUBLIC / 'provenance.json')
        self.assertEqual(provenance['license'], 'CC BY 3.0 IGO')
        self.assertEqual(provenance['administrativeIdentities'], 514)
        self.assertEqual(provenance['prototypeStatus'], 'PROTOTYPE_VERIFIED')
        self.assertEqual(provenance['productionStatus'], 'PRODUCTION_UNVERIFIED')
        self.assertEqual(provenance['sourceSha256'], self.validation['sourceSha256'])
        for props, _ in self.provinces + self.districts:
            self.assertEqual(set(props), {'code', 'name', 'parent'})


if __name__ == '__main__':
    unittest.main()
