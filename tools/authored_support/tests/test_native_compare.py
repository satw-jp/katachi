import os
from pathlib import Path
import unittest
from unittest.mock import patch
from tools.authored_support.mesh_backend import ManifoldKernel
from tools.authored_support.native_compare import compare, canonical_oriented_triangles
from tools.authored_support.contracts import ContractError
from test_v2_contracts import temporary_directory


class NativeComparison(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kernel = ManifoldKernel.from_runtime_root(Path(os.environ['AUTHORED_SUPPORT_GEOMETRY_RUNTIME']))

    def fixture(self, directory):
        np = self.kernel.np
        path = Path(directory) / 'test.npz'
        vertices = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], np.float32)
        faces = np.array([[0, 1, 2]], np.uint32)
        np.savez_compressed(path, vertices=vertices, faces=faces)
        scale = float(format(0.7333333333333333, '.15g'))
        build = np.eye(4); build[:3, :3] *= scale
        native = dict(vertices=vertices.astype(float), faces=faces, offset=np.zeros(3),
                      component=np.eye(4), build=build, part_id='3', entry='support.model')
        kwargs = dict(plan={'objects':[{'id':'s', 'mesh_source':str(path)}]},
                      assembly={'common_plate_translation_mm':[0, 0, 0]}, topology={},
                      package=Path(directory)/'reference.3mf', expected_sha256='a'*64, kernel=self.kernel,
                      transform_lock={'source_to_plate_scale':0.7333333333333333,
                                      'source_to_plate_translation_mm':[0, 0, 0], 'application_count':1})
        return native, kwargs

    def test_exact_native_coordinates_and_changed_vertex(self):
        with temporary_directory() as d:
            native, kwargs = self.fixture(d)
            with patch('tools.authored_support.native_compare.sha256_file', return_value='a'*64), \
                 patch('tools.authored_support.native_compare.decode', return_value=native):
                self.assertEqual(compare(**kwargs)['status'], 'PASS')
                native['vertices'][1, 0] += 0.001
                self.assertEqual(compare(**kwargs)['mismatch_ids'], ['s'])

    def test_double_scale_is_rejected(self):
        with temporary_directory() as d:
            native, kwargs = self.fixture(d)
            native['build'][:3, :3] *= kwargs['transform_lock']['source_to_plate_scale']
            with patch('tools.authored_support.native_compare.sha256_file', return_value='a'*64), \
                 patch('tools.authored_support.native_compare.decode', return_value=native):
                with self.assertRaises(ContractError):
                    compare(**kwargs)

    def test_native_face_order_is_not_geometry_but_winding_and_multiplicity_are(self):
        np = self.kernel.np
        a = np.array([[[0,0,0],[1,0,0],[0,1,0]], [[0,0,1],[1,0,1],[0,1,1]]], np.float32)
        canonical = canonical_oriented_triangles(a, np)
        self.assertTrue(np.array_equal(canonical, canonical_oriented_triangles(np.roll(a[::-1],1,axis=1),np)))
        reversed_face = a.copy();reversed_face[0]=reversed_face[0,::-1]
        self.assertFalse(np.array_equal(canonical,canonical_oriented_triangles(reversed_face,np)))
        self.assertFalse(np.array_equal(canonical,canonical_oriented_triangles(a[:1],np)))
