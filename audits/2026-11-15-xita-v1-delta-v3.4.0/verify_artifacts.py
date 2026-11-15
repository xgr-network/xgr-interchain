#!/usr/bin/env python3
import csv,hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parent
manifest=json.loads((root/'archive-manifest.json').read_text())
for row in manifest['files']:
 p=root/row['path'];assert p.is_file(),row['path'];assert p.stat().st_size==row['bytes'],row['path'];assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'],row['path']
f=json.loads((root/'finding-details.json').read_text());assert len(f)==40 and len({x['id'] for x in f})==40
assert next(x for x in f if x['id']=='F-20')['status']=='VERIFIED / RESOLVED'
assert all(next(x for x in f if x['id']==i)['status']=='PARTIALLY_MITIGATED' for i in ['F-08','F-19','F-36'])
with (root/'historical-findings-matrix.csv').open() as h: assert len(list(csv.DictReader(h)))==43
print('PASS: %s files, 40 unique causes, 43 preserved historical rows'%len(manifest['files']))
