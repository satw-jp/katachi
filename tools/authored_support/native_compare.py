"""Read-only native Support comparison. No manufacturing export is produced."""
from array import array
from pathlib import Path
import json
import zipfile
import xml.etree.ElementTree as ET
import xml.parsers.expat

from .contracts import ContractError
from .source_io import read_json, sha256_file

CORE = '{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}'
PROD = '{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}'


def canonical_oriented_triangles(triangles, np):
    """Exact identity independent of face order and cyclic starting vertex.

    Winding, coordinate values, multiplicity and per-object boundaries remain
    significant. No rounding, distance tolerance, welding or face deletion.
    """
    rotations = np.stack([np.roll(triangles, -i, axis=1).reshape(-1, 9) for i in range(3)], axis=1)
    first = np.lexsort(np.moveaxis(rotations, 2, 0)[::-1], axis=-1)[:, 0]
    canonical = rotations[np.arange(len(triangles)), first]
    return canonical[np.lexsort(canonical.T[::-1])]


def matrix(text, np):
    values = np.array([float(x) for x in text.split()])
    if values.shape != (12,):
        raise ContractError('native transform must have 12 values')
    result = np.eye(4)
    result[:3, :] = values.reshape(4, 3).T
    return result


def decode(package, np):
    with zipfile.ZipFile(package) as archive:
        root = ET.fromstring(archive.read('3D/3dmodel.model'))
        settings = ET.fromstring(archive.read('Metadata/model_settings.config'))
        found = []
        for obj in settings.findall('object'):
            for part in obj.findall('part'):
                meta = {m.get('key'): m.get('value') for m in part.findall('metadata')}
                if meta.get('name') == 'REMOVABLE_SUPPORT.stl':
                    found.append((obj, part, meta))
        if len(found) != 1:
            raise ContractError('successful native must have one distinct Support part')
        obj, part, meta = found[0]
        group = next(o for o in root.find(CORE + 'resources').findall(CORE + 'object') if o.get('id') == obj.get('id'))
        components = group.find(CORE + 'components').findall(CORE + 'component')
        if len(components) != 2:
            raise ContractError('Artwork/Permanent and Support must remain two native parts')
        component = next(c for c in components if c.get('objectid') == part.get('id'))
        builds = root.find(CORE + 'build').findall(CORE + 'item')
        if len(builds) != 1 or builds[0].get('objectid') != group.get('id'):
            raise ContractError('ambiguous native build transform chain')
        entry = component.get(PROD + 'path').lstrip('/')
        vertices, faces, object_ids = array('d'), array('I'), []
        def start(name, attrs):
            tag = name.rsplit(':', 1)[-1]
            if tag == 'object':
                object_ids.append(attrs['id'])
            elif tag == 'vertex':
                vertices.extend(float(attrs[k]) for k in ['x', 'y', 'z'])
            elif tag == 'triangle':
                faces.extend(int(attrs[k]) for k in ['v1', 'v2', 'v3'])
        parser = xml.parsers.expat.ParserCreate()
        parser.StartElementHandler = start
        with archive.open(entry) as stream:
            while chunk := stream.read(4 << 20):
                parser.Parse(chunk, False)
            parser.Parse(b'', True)
    if object_ids != [part.get('id')]:
        raise ContractError('native geometry object identity mismatch')
    return dict(vertices=np.frombuffer(vertices, dtype=np.float64).reshape(-1, 3),
                faces=np.frombuffer(faces, dtype=np.uint32).reshape(-1, 3),
                offset=np.array([float(meta['source_offset_' + axis]) for axis in 'xyz']),
                component=matrix(component.get('transform'), np),
                build=matrix(builds[0].get('transform'), np),
                part_id=part.get('id'), entry=entry)


def compare(*, plan, assembly, topology, package, expected_sha256, kernel, transform_lock):
    if sha256_file(package) != expected_sha256:
        raise ContractError('successful native SHA mismatch before decode')
    np = kernel.np
    native = decode(package, np)
    translation = np.array(assembly['common_plate_translation_mm'])
    component, build = native['component'], native['build']
    scale = transform_lock['source_to_plate_scale']
    # The native writer serialized its scale to 15 significant digits.
    expected_scale = float(format(scale, '.15g'))
    transform_checks = dict(
        application_count=transform_lock.get('application_count') == 1,
        component_rotation=np.array_equal(component[:3, :3], np.eye(3)),
        build_scale=np.array_equal(build[:3, :3], np.eye(3) * expected_scale),
        ideal_translation=np.array_equal(build[:3, :3] @ translation + build[:3, 3],
                                         np.array(transform_lock['source_to_plate_translation_mm'])),
        component_offset=np.array_equal(component[:3, 3], np.array([float(format(x, '.12g')) for x in native['offset']])),
    )
    if not all(transform_checks.values()):
        raise ContractError('native transform lock mismatch or double scale')
    cursor, omitted, bad, checks, reordered = 0, 0, [], [], []
    for row in plan['objects']:
        path = row['mesh_source'] if row.get('revision', '').startswith('P10') else topology.get(row['id'], row['mesh_source'])
        with np.load(path) as q:
            # Original export uses float64 translation followed by float32 STL.
            vf = (q['vertices'].astype(float) + translation).astype(np.float32)
            tri = vf[q['faces']]
        xyz = tri.astype(float)
        keep = np.linalg.norm(np.cross(xyz[:, 1] - xyz[:, 0], xyz[:, 2] - xyz[:, 0]), axis=1) > 0
        omitted += int((~keep).sum())
        # Native import centers its float32 mesh before XML round-trip. Compare
        # restored float32 values exactly; no approximate geometry tolerance.
        expected = tri[keep] - native['offset'].astype(np.float32)
        count = len(expected)
        face_indices = native['faces'][cursor:cursor + count]
        actual = native['vertices'][face_indices].astype(np.float32)
        ordered_equal = actual.shape == expected.shape and np.array_equal(actual, expected)
        equal = ordered_equal
        if not equal and actual.shape == expected.shape:
            equal = np.array_equal(canonical_oriented_triangles(actual, np),
                                   canonical_oriented_triangles(expected, np))
            if equal:
                reordered.append(dict(id=row['id'], ordered_mismatch_triangles=int(np.any(actual != expected, axis=(1,2)).sum())))
        if not equal:
            bad.append(row['id'])
        checks.append(dict(id=row['id'], first_triangle=cursor, triangles=count, equal=equal, ordered_equal=ordered_equal))
        cursor += count
    count_equal = cursor == len(native['faces'])
    effective_translation = build[:3, :3] @ (translation + component[:3, 3] - native['offset'].astype(np.float32).astype(float)) + build[:3, 3]
    return dict(status='PASS' if count_equal and not bad else 'HOLD',
                source_sha256=expected_sha256, support_part_id=native['part_id'], entry=native['entry'],
                generated_triangles=cursor, native_triangles=len(native['faces']), triangle_count_equal=count_equal,
                zero_area_omitted=omitted, mismatch_ids=bad, objects=checks,
                comparison='Exact float32 oriented triangle multiset per Support ID; only face order and cyclic starting vertex ignored. Winding, multiplicity and all coordinates retained; zero numerical tolerance.',
                reordered_objects=reordered,
                transform_checks=transform_checks, source_scale_application_count=1,
                native_build=build.tolist(), native_component=component.tolist(),
                effective_translation_mm=effective_translation.tolist(),
                locked_ideal_translation_mm=transform_lock['source_to_plate_translation_mm'],
                note='Native import float32 centering and XML transform serialization are reported separately from ideal source-to-plate translation.')
