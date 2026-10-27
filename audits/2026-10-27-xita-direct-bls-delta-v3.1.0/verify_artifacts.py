#!/usr/bin/env python3
"""Verify correction artifacts from a real checkout; no network access."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'archive-manifest.json').read_text())
failures = []
for item in manifest['files']:
    path = root / item['path']
    if not path.is_file():
        failures.append('Missing: ' + item['path'])
        continue
    data = path.read_bytes()
    git_blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if len(data) != item['bytes'] or git_blob != item['git_blob']:
        failures.append('Size/Git object mismatch: ' + item['path'])
    if 'sha256' in item and hashlib.sha256(data).hexdigest() != item['sha256']:
        failures.append('SHA-256 mismatch: ' + item['path'])
with zipfile.ZipFile(root / 'evidence-public.zip') as archive:
    if archive.testzip() is not None:
        failures.append('ZIP CRC failure')
    if len(archive.namelist()) != manifest['evidence_zip_entries']:
        failures.append('ZIP entry count mismatch')
    internal = json.loads(archive.read('evidence/MANIFEST.json'))
    for item in internal['files']:
        data = archive.read('evidence/' + item['path'])
        if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
            failures.append('Evidence mismatch: ' + item['path'])
    if archive.read('evidence/MANIFEST.json') != (root / 'evidence/MANIFEST.json').read_bytes():
        failures.append('External/internal evidence manifest mismatch')
if failures:
    raise SystemExit('\n'.join(failures))
print('PASS:', len(manifest['files']), 'artifacts;', manifest['evidence_zip_entries'], 'ZIP entries')
