"""Deterministic legacy addon ZIP; no project, binary dependency, or cache included."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
package = here / 'skin_branch_editor'
(package / 'DEPENDENCY_MANIFEST.json').write_bytes((here / 'DEPENDENCY_MANIFEST.json').read_bytes())
(package / 'LEGACY_SOURCE_HASHES.json').write_bytes((here / 'LEGACY_SOURCE_HASHES.json').read_bytes())
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for file in sorted(package.rglob('*')):
        if file.is_file() and '__pycache__' not in file.parts:
            info = zipfile.ZipInfo(str(file.relative_to(here)).replace('\\', '/'), (2026, 10, 10, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, file.read_bytes())
print(json.dumps({'path': str(args.output.resolve()), 'bytes': args.output.stat().st_size,
                  'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))
