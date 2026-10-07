"""Loopback-only, single-user creation session. No printing or arbitrary commands."""
from __future__ import annotations
import argparse
import copy
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import uuid
import zipfile
from importlib.metadata import version
import numpy as np
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from engine import ROOT, LOCK, read, write, sha, validate_assets, validate_recipe, scene
from surface.replay import canonical_array_digest
from internal.geometry import canonical_mesh_digest
from metadata import validate_mesh
from print_workflow import PrintWorkflow, validate_saved

MAX_ZIP = 512 * 1024**2
MAX_EXPANDED = 2 * 1024**3
SCHEMA = 'katachi.skin.creation.v0'

def dependency_versions():
    return {name: version(name) for name in ('numpy', 'scipy', 'trimesh', 'manifold3d')}

def code_files():
    return sorted(p for p in ROOT.rglob('*.py') if '__pycache__' not in p.parts)

def code_identity():
    return {p.relative_to(ROOT).as_posix(): sha(p) for p in code_files()}

def safe_relative(name):
    p = PurePosixPath(name)
    if not name or '\\' in name or ':' in name or p.is_absolute() or '..' in p.parts or str(p) != name:
        raise ValueError('Invalid archive path')
    return p

def fresh_state():
    return dict(schema=SCHEMA, history=[], cursor=-1, compare=None, selected=None, results={}, revision=0, job=None)

def validate_state(state, project):
    if state.get('schema') != SCHEMA or state.get('job') is not None:
        raise ValueError('Wrong project version or unfinished job')
    history, results, cursor = state['history'], state['results'], state['cursor']
    if 'printing' in state: validate_saved(state['printing'], results)
    if not isinstance(history, list) or not isinstance(cursor, int) or not (-1 <= cursor < len(history)) or (history and cursor < 0):
        raise ValueError('Invalid history cursor')
    if any(key not in results for key in history) or any(state[k] is not None and state[k] not in results for k in ('compare', 'selected')):
        raise ValueError('Dangling history/comparison')
    for key, result in results.items():
        if not re.fullmatch('[a-f0-9]{32}', key) or result['id'] != key:
            raise ValueError('Invalid result ID')
        validate_recipe(result['recipe'])
        if result != read(project / 'results' / key / 'result.json'):
            raise ValueError('Result/history mismatch')
        for name in ('layout', 'mesh', 'structure'):
            safe_relative(result[name])
        # Validate renderable payloads before atomically replacing the live project.
        with np.load(project / result['mesh'], allow_pickle=False) as archive:
            vertices, faces = archive['vertices'], archive['faces']
            if (vertices.ndim != 2 or vertices.shape[1] != 3 or not len(vertices) or
                not np.isfinite(vertices).all() or faces.ndim != 2 or faces.shape[1] != 3 or
                not len(faces) or faces.dtype.kind not in 'iu' or faces.min() < 0 or faces.max() >= len(vertices)):
                raise ValueError('Invalid generated mesh')
            mesh_ids = archive['member_ids'].tolist()
        surface = read(project / result['layout'] / 'surface/surface.json')
        structure = read(project / result['structure'])
        validate_mesh(structure, project / result['mesh'])
        if mesh_ids != [m['id'] for m in structure['members']] or len(mesh_ids) != result['memberCount']:
            raise ValueError('Mesh/structure member identity mismatch')
        for member in structure['members']:
            va, vb = member['mesh_vertex_range']; fa, fb = member['mesh_face_range']
            if not (0 <= va < vb <= len(vertices) and 0 <= fa < fb <= len(faces)):
                raise ValueError('Invalid member mesh range')
            local_faces = faces[fa:fb].astype(np.int64) - va
            if local_faces.min() < 0 or local_faces.max() >= vb - va:
                raise ValueError('Cross-member mesh indices')
            if canonical_mesh_digest(vertices[va:vb], local_faces) != member['mesh_geometry_sha256']:
                raise ValueError('Mesh does not match generated member: ' + member['id'])
        with np.load(project / result['layout'] / 'surface/placements.npz', allow_pickle=False) as archive:
            placements = dict(archive)
        if canonical_array_digest(placements) != result['surfaceHash']:
            raise ValueError('Placement payload mismatch')
        for field, array in [('position_mm', 'position_mm'), ('rotation_quaternion_wxyz', 'quaternion_wxyz'),
                             ('physical_scale', 'physical_scale'), ('anchor_world_mm', 'anchor_world_mm')]:
            if not np.array_equal(np.asarray([i[field] for i in surface['instances']]), placements[array]):
                raise ValueError('Surface mirror mismatch: ' + field)
        if (surface['semantic_geometry_sha256'] != result['surfaceHash'] or
            surface['count'] != result['flowerCount'] or
            structure['centerline_semantic_sha256'] != result['centerlineHash'] or
            structure['structure_semantic_sha256'] != result['meshHash'] or
            structure['diameter_main_mm'] != result['recipe']['diameter'] or
            any(i['flower_global_scale'] != result['recipe']['flowerScale'] for i in surface['instances'])):
            raise ValueError('Generated result does not match recipe')

def pack(project, state):
    saved = copy.deepcopy(state)
    saved['job'] = None
    validate_state(saved, project)
    files = {}
    for p in (project / 'assets').rglob('*'):
        if p.is_file(): files[p.relative_to(project).as_posix()] = p.read_bytes()
    # Only complete, referenced results/layouts. Failed/abandoned jobs are not history.
    roots = {project / 'results' / k for k in saved['results']}
    roots.update(project / r['layout'] for r in saved['results'].values())
    for root in roots:
        for p in root.rglob('*'):
            if p.is_file(): files[p.relative_to(project).as_posix()] = p.read_bytes()
    for p in code_files(): files['code/' + p.relative_to(ROOT).as_posix()] = p.read_bytes()
    files['project.json'] = json.dumps(saved, ensure_ascii=False).encode()
    files['runtime.json'] = json.dumps({'python': sys.version, 'packages': dependency_versions(),
        'reopen': 'Open this archive in SKIN Creation UI v0 with matching code. Never execute untrusted embedded code.',
        'sources': 'All original inputs embedded; no original J-drive outputs required.'}).encode()
    manifest = {'schema': SCHEMA, 'code': code_identity(),
                'files': {n: {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()} for n, b in files.items()},
                'capacity': {group: sum(len(b) for n, b in files.items() if n.startswith(group))
                             for group in ('assets/', 'layouts/', 'results/', 'code/', 'project.json')}}
    if sum(map(len, files.values())) > MAX_EXPANDED: raise ValueError('Save exceeds 2 GiB expanded limit; history was not discarded')
    # Content-addressed entries deduplicate regenerated identical results too.
    blobs = {hashlib.sha256(b).hexdigest(): b for b in files.values()}
    manifest['uniqueStoredBytes'] = sum(map(len, blobs.values()))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr('manifest.json', json.dumps(manifest))
        for digest, b in sorted(blobs.items()): z.writestr('blobs/' + digest, b)
    data = buffer.getvalue()
    if len(data) > MAX_ZIP: raise ValueError('Save exceeds 512 MiB limit; history was not discarded')
    return data

def unpack(data, target):
    if len(data) > MAX_ZIP: raise ValueError('Archive too large')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        entries = z.infolist()
        names = [i.filename for i in entries]
        if len(names) != len(set(names)) or len(names) > 10000: raise ValueError('Duplicate/excess entries')
        if sum(i.file_size for i in entries) > MAX_EXPANDED: raise ValueError('Expanded archive too large')
        for name in names: safe_relative(name)
        manifest = json.loads(z.read('manifest.json'))
        if manifest['schema'] != SCHEMA or manifest['code'] not in (code_identity(), read(ROOT / 'archive_compatibility.json')['metadataFix1']):
            raise ValueError('Generator version mismatch; saved code is never executed')
        locks = manifest['files']
        for name in locks: safe_relative(name)
        for name, digest in manifest['code'].items():
            if locks.get('code/' + name, {}).get('sha256') != digest:
                raise ValueError('Embedded generator snapshot mismatch')
        if sum(lock['bytes'] for lock in locks.values()) > MAX_EXPANDED: raise ValueError('Logical archive too large')
        if set(names) != {'blobs/' + lock['sha256'] for lock in locks.values()} | {'manifest.json'}: raise ValueError('Archive inventory mismatch')
        # Check everything before writing or changing the live project.
        for name, lock in manifest['files'].items():
            content = z.read('blobs/' + lock['sha256'])
            if len(content) != lock['bytes'] or hashlib.sha256(content).hexdigest() != lock['sha256']:
                raise ValueError('Archive content mismatch: ' + name)
        for name, lock in locks.items():
            path = target / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(z.read('blobs/' + lock['sha256']))
    validate_assets(target / 'assets')
    if read(target / 'runtime.json')['packages'] != dependency_versions():
        raise ValueError('Saved generator dependencies differ; use the saved runtime versions')
    state = read(target / 'project.json')
    validate_state(state, target)
    return state

class Session:
    def __init__(self, storage):
        self.storage = storage
        self.lock = threading.RLock()
        self.project = storage / uuid.uuid4().hex
        self.project.mkdir(parents=True)
        shutil.copytree(ROOT / 'assets', self.project / 'assets')
        validate_assets(self.project / 'assets')
        self.state = fresh_state()

    def snapshot(self):
        return copy.deepcopy(self.state)

    def busy(self):
        return self.state['job'] and self.state['job']['status'] == 'running'

    def generate(self, body):
        recipe = validate_recipe({k: body[k] for k in ('flowerScale', 'diameter')})
        if self.busy(): raise ValueError('Generation already running')
        key, revision, project = uuid.uuid4().hex, self.state['revision'], self.project
        self.state['job'] = dict(id=key, status='running', stage='生成を準備', error=None)
        def run():
            try:
                args = [sys.executable, str(ROOT / 'engine.py'), str(project), json.dumps(recipe), key]
                if body.get('force'): args.append('--fresh')
                log_path = project / (key + '.log')
                with log_path.open('w', encoding='utf-8') as log:
                    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', env=dict(os.environ, PYTHONIOENCODING='utf-8'))
                    for line in process.stdout:
                        log.write(line); log.flush()
                        try:
                            stage = json.loads(line)['stage']
                            with self.lock:
                                if self.state['job'] and self.state['job']['id'] == key: self.state['job']['stage'] = stage
                        except (ValueError, KeyError): pass
                    if process.wait() != 0:
                        raise ValueError(log_path.read_text(encoding='utf-8')[-2000:])
                result = read(project / 'results' / key / 'result.json')
                with self.lock:
                    if self.project != project or self.state['revision'] != revision: return
                    self.state['results'][key] = result
                    self.state['history'] = self.state['history'][:self.state['cursor'] + 1] + [key]
                    self.state['cursor'] = len(self.state['history']) - 1
                    self.state['revision'] += 1
                    self.state['job'] = None
                    write(project / 'session.json', self.state)
            except Exception as exc:
                with self.lock:
                    if self.project == project and self.state['job'] and self.state['job']['id'] == key:
                        self.state['job'] = dict(id=key, status='failed', stage='生成失敗：直前の造形を保持', error=str(exc))
        threading.Thread(target=run, daemon=True).start()

def serve(port, storage, resume=None):
    session = Session(storage)
    if resume:
        restored = read(resume / 'session.json')
        validate_assets(resume / 'assets')
        validate_state(restored, resume)
        session.project, session.state = resume, restored
    workflow = PrintWorkflow(session, Path(os.environ.get('SKIN_PRINT_OUTPUT', str(storage.parent / 'print-artifacts'))))
    class Handler(BaseHTTPRequestHandler):
        def send(self, value, kind='application/json', status=200):
            data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            if kind == 'application/zip': self.send_header('Content-Disposition', 'attachment; filename="SKIN-creation.skincreation"')
            self.end_headers()
            self.wfile.write(data)

        def send_file(self, path):
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(path.stat().st_size))
            self.send_header('Content-Disposition', 'attachment; filename="' + path.name + '"')
            self.end_headers()
            with path.open('rb') as source: shutil.copyfileobj(source, self.wfile)

        def guard(self):
            # No wildcard CORS. Only our Vite UI or direct loopback requests.
            origin = self.headers.get('Origin')
            if origin and origin not in (f'http://127.0.0.1:{os.environ.get("SKIN_CREATION_UI_PORT", "5188")}', f'http://localhost:{os.environ.get("SKIN_CREATION_UI_PORT", "5188")}'):
                raise ValueError('Untrusted origin')

        def do_GET(self):
            try:
                self.guard()
                route = self.path.removeprefix('/creation-api')
                with session.lock:
                    if route == '/print/state': return self.send(workflow.state())
                    match = re.fullmatch('/print/artifact/([a-f0-9]{32})/([a-zA-Z0-9_.]+)', route)
                    if match: return self.send_file(workflow.artifact(*match.groups()))
                    match = re.fullmatch('/print/bundle/([a-f0-9]{32})', route)
                    if match: return self.send(workflow.bundle(match[1]), 'application/zip')
                    if route == '/state': return self.send(session.snapshot())
                    if route == '/save':
                        if session.busy() or workflow.busy(): raise ValueError('Wait for generation/slice before saving')
                        return self.send(pack(session.project, session.state), 'application/zip')
                    match = re.fullmatch('/result/([a-f0-9]{32})/scene.json', route)
                    if match:
                        key = match[1]
                        return self.send(scene(session.project, session.state['results'][key]))
                self.send({'error': 'Not found'}, status=404)
            except Exception as exc: self.send({'error': str(exc)}, status=400)

        def do_POST(self):
            try:
                self.guard()
                count = int(self.headers.get('Content-Length', 0))
                if not 0 <= count <= MAX_ZIP: raise ValueError('Request too large')
                data = self.rfile.read(count)
                route = self.path.removeprefix('/creation-api')
                with session.lock:
                    if session.busy(): raise ValueError('Wait for generation; current result is protected')
                    if route.startswith('/print/'):
                        if route == '/print/rebind': return self.send(workflow.rebind(data))
                        body = json.loads(data or b'{}')
                        actions = {'/print/prepare': lambda: workflow.prepare(body), '/print/place': workflow.place, '/print/preset': lambda: workflow.preset(body), '/print/run': lambda: workflow.start(body), '/print/cancel': workflow.cancel}
                        if route not in actions: raise ValueError('Unknown print operation')
                        return self.send(actions[route]())
                    if workflow.busy() and route in ('/open', '/new', '/generate'): raise ValueError('Cancel or finish active slice first')
                    if route == '/open':
                        target = storage / uuid.uuid4().hex
                        state = unpack(data, target)
                        state['revision'] = session.state['revision'] + 1
                        session.project, session.state = target, state
                    else:
                        body = json.loads(data or b'{}')
                        if route == '/generate': session.generate(body)
                        elif route == '/undo':
                            if session.state['cursor'] > 0: session.state['cursor'] -= 1
                            session.state['revision'] += 1
                        elif route == '/redo':
                            if session.state['cursor'] + 1 < len(session.state['history']): session.state['cursor'] += 1
                            session.state['revision'] += 1
                        elif route in ('/compare', '/select'):
                            if body['id'] is not None and body['id'] not in session.state['results']: raise ValueError('Unknown result')
                            session.state['compare' if route == '/compare' else 'selected'] = body['id']
                            session.state['revision'] += 1
                        elif route == '/new':
                            fresh = Session(storage)
                            session.project, session.state = fresh.project, fresh.state
                        else: raise ValueError('Unknown operation')
                    self.send(session.snapshot())
            except Exception as exc: self.send({'error': str(exc)}, status=400)
    print(f'SKIN creation engine http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5189)
    parser.add_argument('--storage', type=Path, default=ROOT.parents[1] / 'outputs/skin-creation-sessions')
    parser.add_argument('--resume', type=Path, help='Resume an explicitly selected local completed session')
    args = parser.parse_args()
    serve(args.port, args.storage, args.resume)
