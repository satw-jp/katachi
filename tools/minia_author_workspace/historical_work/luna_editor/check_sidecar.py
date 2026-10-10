import base64,zlib,hashlib
from pathlib import Path
b=Path('work/luna_editor/MINIA_SOURCE_LEDGER.zlib.base64').read_text().split();x=base64.b64decode(''.join(b));print('sidecar',len(x),hashlib.sha256(x).hexdigest());print('decompress',len(zlib.decompress(x)))
