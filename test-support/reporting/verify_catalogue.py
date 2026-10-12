"""Read-only provenance check for the GA-1 seed; never downloads or rewrites data.

Supply the three official PDFs and an installed pdftotext executable explicitly.
Example: python test-support/reporting/verify_catalogue.py --help
The app and Maven build do not depend on this development helper.
"""
import argparse
import collections
import hashlib
import re
import subprocess
from pathlib import Path

PINS = {
    'decision': 'f403c4b2159054e4556624d8f3724a27ea2ac2281916d21768d3d776434f2c56',
    'annex': 'ac13b5a57358fcec0503429bb06b2d6b4e5572f65fd0162979b87a79863b1de6',
    'amendment': 'b5ea05544536335ee567a2a7b871a9c4325c1ba437a200d7698b6faff7a2ba1e',
}
CATALOGUE_DIGEST = '479d06184e8cf618b306967974baddd00a3502aee6e11104fc89e07d779fa63b'
VERSION = 'KEMENDAGRI_2025_2138_AMENDED_2430'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def extract(text):
    provinces, regencies, expected_counts = {}, {}, {}
    section, parent = 'A', None
    for page in text.split('\f'):
        for line in page.splitlines():
            if re.match(r'\s*B\. Rincian Kode', line):
                section, parent = 'B', None
            if re.match(r'\s*C\. Rincian Kode', line):
                section = 'C'
            if section == 'A':
                match = re.match(r'^\s*\d+\s+(\d{2})\s+(.+?)\s{2,}(\d+)\s+(\d+)\s', line)
                if match:
                    code, name, kab, kota = match.groups()
                    require(code not in provinces, 'Duplicate explicit province')
                    provinces[code] = name.strip()
                    expected_counts[code] = (int(kab), int(kota))
            if section == 'B':
                heading = re.match(r'^\s*[a-z]+\.\s*Provinsi (.+?)\s*$', line)
                if heading:
                    matches = [code for code, name in provinces.items() if name == heading[1].strip()]
                    require(len(matches) == 1, 'Unresolved explicit province heading')
                    parent = matches[0]  # Explicit heading/name join, never a numeric-prefix assumption.
                match = re.match(r'^\s*\d+\s+(\d{2}\.\d{2})\s+(.+?)\s{2,}\d', line)
                if match:
                    code, name = match.groups()
                    require(parent is not None and code not in regencies, 'Missing parent or duplicate region')
                    regencies[code] = (name.strip(), parent)
    require(len(provinces) == 38 and len(regencies) == 514, 'Incomplete official catalogue')
    counts = collections.defaultdict(lambda: [0, 0])
    for name, parent in regencies.values():
        require(name.startswith(('Kabupaten ', 'Kab ', 'Kota ')), 'Unrecognized government label')
        counts[parent][1 if name.startswith('Kota ') else 0] += 1
    require(all(tuple(counts[code]) == total for code, total in expected_counts.items()),
            'Chapter B counts disagree with Chapter A')
    rows = [('PROVINCE', code, name, '') for code, name in provinces.items()]
    rows.extend(('REGENCY', code, name, parent) for code, (name, parent) in regencies.items())
    return sorted(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in PINS:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--pdftotext', type=Path, required=True)
    parser.add_argument('--migration', type=Path, default=Path(__file__).resolve().parents[2] /
                        'src/main/resources/db/migration/V19__geographic_reporting.sql')
    args = parser.parse_args()
    for name, expected in PINS.items():
        digest = hashlib.sha256(getattr(args, name).read_bytes()).hexdigest()
        require(digest == expected, f'Official {name} PDF checksum mismatch')
    result = subprocess.run([str(args.pdftotext), '-layout', '-enc', 'UTF-8', str(args.annex), '-'],
                            shell=False, capture_output=True, timeout=120, check=True)
    rows = extract(result.stdout.decode('utf-8'))
    canonical = ''.join('|'.join(row) + '\n' for row in rows)
    require(hashlib.sha256(canonical.encode()).hexdigest() == CATALOGUE_DIGEST, 'Extracted seed checksum mismatch')
    literal = r"'((?:[^']|'')*)'"
    pattern = r"\('" + VERSION + "'," + literal + ',' + literal + ',' + literal + r",('(?:[^']|'')*'|NULL),('(?:[^']|'')*'|NULL)\)"
    migration = args.migration.read_text(encoding='utf-8')
    region_sql = migration.split('INSERT INTO reporting_regions(catalogue_version,code,level,name,parent_code,parent_level) VALUES', 1)[1]
    seed = []
    for code, level, name, parent, parent_level in re.findall(pattern, region_sql):
        parent = '' if parent == 'NULL' else parent[1:-1].replace("''", "'")
        require(parent_level == ("'PROVINCE'" if level == 'REGENCY' else 'NULL'), 'Seed parent level mismatch')
        seed.append((level, code, name.replace("''", "'"), parent))
    require(sorted(seed) == rows, 'V19 differs from the verified official identities or relationships')
    print('PASS: 3 official source digests; 38 provinces; 514 regencies/cities; all explicit parents;'
          ' all 38 province counts; V19 exact seed; canonical SHA256 ' + CATALOGUE_DIGEST)


if __name__ == '__main__':
    main()
