"""Creation metadata validation using the unchanged #36 semantic projection."""
import numpy as np
from internal.core import digest_json
from internal.geometry import canonical_mesh_digest

FIELDS = ('id', 'role', 'parent_id', 'target_id', 'target_component_id',
          'representative_flower_id', 'points_mm', 'main_diameter_mm',
          'terminal_diameter_mm', 'taper_length_mm', 'rule_version',
          'geometry_semantic_sha256', 'mesh_geometry_sha256')

def structure_digest(members):
    return digest_json([{k: m.get(k) for k in FIELDS}
                        for m in sorted(members, key=lambda m: m['id'])])

def validate_mesh(structure, path, metadata=True):
    members = structure['members']
    with np.load(path, allow_pickle=False) as a:
        v, f = a['vertices'], a['faces']
        ids = a['member_ids'].tolist()
        if ids != [m['id'] for m in members] or len(set(ids)) != len(ids):
            raise ValueError('Mesh member IDs mismatch')
        if (v.ndim != 2 or v.shape[1] != 3 or not len(v) or not np.isfinite(v).all()
                or f.ndim != 2 or f.shape[1] != 3 or not len(f) or f.dtype.kind not in 'iu'):
            raise ValueError('Invalid mesh arrays')
        for field, ranges, size in [('vertex_offsets', 'mesh_vertex_range', len(v)),
                                    ('face_offsets', 'mesh_face_range', len(f))]:
            offsets = a[field]
            if (offsets.dtype.kind not in 'iu' or offsets.shape != (len(members)+1,)
                    or offsets[0] != 0 or offsets[-1] != size or np.any(np.diff(offsets) <= 0)):
                raise ValueError('Invalid mesh offsets: ' + field)
            if any(m[ranges] != offsets[i:i+2].tolist() for i, m in enumerate(members)):
                raise ValueError('Member ranges/offsets mismatch')
        for m in members:
            va, vb = m['mesh_vertex_range']; fa, fb = m['mesh_face_range']
            local = f[fa:fb].astype(np.int64) - va
            if local.min() < 0 or local.max() >= vb-va:
                raise ValueError('Cross-member face indices')
            if canonical_mesh_digest(v[va:vb], local) != m['mesh_geometry_sha256']:
                raise ValueError('Member geometry digest mismatch: ' + m['id'])
        counts = dict(vertex_count=len(v), triangle_count=len(f))
    if structure['member_count'] != len(members):
        raise ValueError('Member count mismatch')
    if metadata:
        if any(structure['mesh_archive'].get(k) != value for k, value in counts.items()):
            raise ValueError('Stale mesh_archive counts; explicit Fix1 conversion required')
        if structure['structure_semantic_sha256'] != structure_digest(members):
            raise ValueError('Structure semantic digest mismatch; explicit Fix1 conversion required')
    return counts
