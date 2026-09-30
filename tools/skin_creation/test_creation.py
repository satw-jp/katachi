import copy
import io
import json
import tempfile
import shutil
import unittest
import zipfile
from unittest.mock import patch
from pathlib import Path
from engine import H, ROOT, resized_members, validate_recipe
from server import fresh_state, validate_state, pack, unpack, code_identity, SCHEMA, safe_relative

class CreationBoundaryTests(unittest.TestCase):
    def test_recipe_boundary(self):
        for g in (1, H):
            for d in (2.2, 2.4): validate_recipe(dict(flowerScale=g, diameter=d))
        for d in (-1, 0, float('nan'), 99):
            with self.assertRaises(ValueError): validate_recipe(dict(flowerScale=1, diameter=d))

    def test_non_cumulative_and_no_replacement(self):
        base = [dict(id='a', main_diameter_mm=2.2, terminal_diameter_mm=1.1, points_mm=[[0,0,0],[1,1,2]])]
        original = copy.deepcopy(base)
        wide = resized_members(base, 2.4)
        self.assertEqual(wide[0]['terminal_diameter_mm'], 1.2)
        self.assertEqual(wide[0]['points_mm'], original[0]['points_mm'])
        self.assertEqual(resized_members(base, 2.2), original)
        self.assertEqual(base, original)
        with self.assertRaises(ValueError): resized_members(wide, 2.4)

    def test_dangling_redo_rejected(self):
        s = fresh_state(); s.update(history=['missing','redo'], cursor=0)
        with self.assertRaises(ValueError): validate_state(s, Path('.'))

    def test_zip_traversal_and_duplicates(self):
        for name in ('../x', '/x', 'C:/x', 'a\\b', 'a//b'):
            with self.assertRaises(ValueError): safe_relative(name)
        for names in (['../bad'], ['project.json','project.json']):
            b = io.BytesIO()
            with zipfile.ZipFile(b, 'w') as z:
                for n in names: z.writestr(n, '{}')
            with tempfile.TemporaryDirectory() as d:
                with self.assertRaises(ValueError): unpack(b.getvalue(), Path(d))

    def test_wrong_code_never_executed(self):
        b = io.BytesIO()
        with zipfile.ZipFile(b,'w') as z: z.writestr('manifest.json', json.dumps(dict(schema=SCHEMA,code={})))
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError): unpack(b.getvalue(),Path(d))

    def test_missing_or_unreadable_mesh_rejected_before_publish(self):
        key = 'a' * 32
        result = dict(id=key, recipe=dict(flowerScale=1, diameter=2.2),
                      layout='layouts/x', mesh='results/a/MEMBER_MESHES.npz', structure='results/a/STRUCTURE.json')
        s = fresh_state(); s.update(history=[key], cursor=0, results={key:result})
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            with patch('server.read', return_value=result):
                with self.assertRaises(FileNotFoundError): validate_state(s, p)
                (p / 'results/a').mkdir(parents=True)
                (p / result['mesh']).write_bytes(b'not an NPZ mesh')
                with self.assertRaises(ValueError): validate_state(s, p)

    def test_portable_assets_dedup_and_corruption(self):
        with tempfile.TemporaryDirectory() as d:
            project = Path(d) / 'original'
            shutil.copytree(ROOT / 'assets', project / 'assets')
            original = fresh_state()
            packed = pack(project, original)
            moved = Path(d) / 'another-folder'
            reopened = unpack(packed, moved)
            self.assertEqual(original, reopened)
            with zipfile.ZipFile(io.BytesIO(packed)) as z:
                contents = {n: z.read(n) for n in z.namelist()}
                self.assertTrue(all(n == 'manifest.json' or n.startswith('blobs/') for n in contents))
                manifest = json.loads(contents['manifest.json'])
                self.assertIn('assets/data/host.npz', manifest['files'])
                self.assertIn('code/engine.py', manifest['files'])
            blob = next(n for n in contents if n.startswith('blobs/'))
            contents[blob] += b'corrupt'
            bad = io.BytesIO()
            with zipfile.ZipFile(bad, 'w', zipfile.ZIP_DEFLATED) as z:
                for n, data in contents.items(): z.writestr(n, data)
            with self.assertRaises(ValueError): unpack(bad.getvalue(), Path(d) / 'bad')
            self.assertEqual(original, reopened)

if __name__ == '__main__': unittest.main()
