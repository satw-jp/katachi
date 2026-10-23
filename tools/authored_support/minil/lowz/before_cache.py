"""Seal/reuse completed detection evidence, never a partially written scan."""
import hashlib,inspect,json
from pathlib import Path
import numpy as np
from .light import sha,write,demands,rooted_volume

def detector_identity():
    return hashlib.sha256((inspect.getsource(demands)+inspect.getsource(rooted_volume)).encode()).hexdigest()

def seal(cache,run):
    cache=Path(cache);run=Path(run);s=json.loads((cache/'SOURCE.json').read_text())
    b=json.loads((run/'LOWZ_DEMANDS_BEFORE.json').read_text())
    if b['source_sha256']!=s['sha256']:raise ValueError('BEFORE_SOURCE_MISMATCH')
    if any(e['cad_z_mm']!=(e['section']+.5)*s['dz_mm'] or e['cad_z_mm']>s['zmax_mm'] for e in b['events']):raise ValueError('BEFORE_PHASE_MISMATCH')
    with np.load(run/'DEMAND_FOOTPRINTS.npz') as a:
        if len(a['offsets'])!=len(b['events'])+1 or a['offsets'][-1]!=len(a['cells']):raise ValueError('FOOTPRINT_BINDING')
    lock=dict(cache_manifest_sha256=sha(cache/'SOURCE.json'),before_sha256=sha(run/'LOWZ_DEMANDS_BEFORE.json'),
        footprints_sha256=sha(run/'DEMAND_FOOTPRINTS.npz'),detector_identity=detector_identity(),numpy_version=np.__version__)
    write(run/'BEFORE_CACHE_BINDING.json',lock)

def load(cache,run):
    cache=Path(cache);run=Path(run);lock=json.loads((run/'BEFORE_CACHE_BINDING.json').read_text())
    actual=dict(cache_manifest_sha256=sha(cache/'SOURCE.json'),before_sha256=sha(run/'LOWZ_DEMANDS_BEFORE.json'),
        footprints_sha256=sha(run/'DEMAND_FOOTPRINTS.npz'),detector_identity=detector_identity(),numpy_version=np.__version__)
    if actual!=lock:raise ValueError('STALE_BEFORE_CACHE')
    events=json.loads((run/'LOWZ_DEMANDS_BEFORE.json').read_text())['events']
    with np.load(run/'DEMAND_FOOTPRINTS.npz') as a:offsets=a['offsets'];cells=a['cells']
    return events,[cells[a:b] for a,b in zip(offsets[:-1],offsets[1:])]
