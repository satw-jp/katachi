import unittest
import numpy as np
import trimesh
import tempfile,json
from pathlib import Path
from unittest.mock import patch
from .section_reader import read_section,from_segments,identity
from .light import demands,write
from .before_cache import detector_identity

def ring(points):
    a=np.array(points,float);return np.stack([a,np.roll(a,-1,axis=0)],axis=1)

class SectionTests(unittest.TestCase):
    def read(self,segments,pitch=.25,shape=(60,60)):
        return from_segments(np.array(segments),np.zeros(2),pitch,shape)
    def test_hole(self):
        r=self.read(np.concatenate([ring([[1,1],[5,1],[5,5],[1,5]]),ring([[2,2],[3,2],[3,3],[2,3]])]))
        self.assertEqual(r['status'],'VALID_SECTION');self.assertEqual(r['area_mm2'],15);self.assertEqual(len(r['cells']),240)
    def test_open_edge(self):
        r=self.read(ring([[1,1],[4,1],[4,4],[1,4]])[:-1]);self.assertEqual(r['status'],'UNKNOWN_SECTION');self.assertIsNone(r['cells'])
    def test_nonmanifold_shared_vertex(self):
        r=self.read(np.concatenate([ring([[1,1],[3,1],[2,2]]),ring([[2,2],[3,3],[1,3]])]));self.assertEqual(r['status'],'UNKNOWN_SECTION')
    def test_duplicate_segment(self):
        a=ring([[1,1],[4,1],[4,4],[1,4]]);self.assertEqual(self.read(np.concatenate([a,a[:1]]))['reason'],'DUPLICATE_SEGMENT')
    def test_independent_components(self):
        r=self.read(np.concatenate([ring([[1,1],[2,1],[2,2],[1,2]]),ring([[10,10],[11,10],[11,11],[10,11]])]));self.assertEqual(r['rings'],2);self.assertEqual(len(r['cells']),32)
    def test_grid_boundary(self):
        r=self.read(ring([[.125,.125],[1.125,.125],[1.125,1.125],[.125,1.125]]));self.assertEqual(r['status'],'VALID_SECTION');self.assertEqual(len(r['cells']),25)
    def test_outside_frame_no_clip(self):
        self.assertEqual(self.read(ring([[-1,1],[2,1],[2,2],[-1,2]]))['reason'],'OUTSIDE_RASTER_FRAME')
    def test_thin_shape(self):
        r=self.read(ring([[1,1],[1.000001,1],[1.000001,4],[1,4]]));self.assertEqual(r['status'],'VALID_SECTION');self.assertGreater(r['area_mm2'],0);self.assertEqual(len(r['cells']),0)
    def test_sub_tolerance_shape_is_not_empty(self):
        m=trimesh.creation.box(extents=[1e-10,1e-10,2]);m.apply_translation([3,3,0])
        r=read_section(m.vertices[m.faces],.1,np.zeros(2),.25,(60,60));self.assertEqual(r['status'],'VALID_SECTION');self.assertGreater(r['area_mm2'],0);self.assertTrue(r['exact_grid_equal']);self.assertEqual(len(r['cells']),0)
    def test_exact_tiny_open_is_unknown(self):
        m=trimesh.creation.box(extents=[1e-10,1e-10,2]);m.apply_translation([3,3,0]);tri=m.vertices[m.faces]
        hit=np.flatnonzero((tri[:,:,2].min(1)<.1)&(tri[:,:,2].max(1)>.1))[0]
        r=read_section(np.delete(tri,hit,axis=0),.1,np.zeros(2),.25,(60,60));self.assertEqual(r['status'],'UNKNOWN_SECTION');self.assertIsNone(r['cells'])
    def test_exact_subgrid_material_at_grid_centre(self):
        m=trimesh.creation.box(extents=[1e-10,1e-10,2]);m.apply_translation([3.125,3.125,0]);tri=m.vertices[m.faces]
        a=read_section(tri,.1,np.zeros(2),.25,(60,60));b=read_section(tri[::-1,::-1],.1,np.zeros(2),.25,(60,60))
        self.assertEqual(a['status'],'VALID_SECTION');self.assertEqual(a['cells'].tolist(),[12*60+12]);np.testing.assert_array_equal(a['cells'],b['cells'])
    def test_self_crossing(self):
        self.assertEqual(self.read(ring([[1,1],[4,4],[1,4],[4,1]]))['reason'],'INVALID_RING')
    def test_roundoff_weld(self):
        a=ring([[1,1],[4,1],[4,4],[1,4]]);a[0,1,0]+=1e-12;self.assertEqual(self.read(a)['status'],'VALID_SECTION')
    def test_exact_z_shared_vertices(self):
        # Octahedron's equator lies exactly in the section; half-open rule
        # uses the upper faces once instead of dropping all incident faces.
        v=np.array([[3,3,1],[3,3,-1],[2,3,0],[3,2,0],[4,3,0],[3,4,0]],float)
        f=np.array([[0,2,3],[0,3,4],[0,4,5],[0,5,2],[1,3,2],[1,4,3],[1,5,4],[1,2,5]])
        r=read_section(v[f],0,np.zeros(2),.25,(60,60));self.assertEqual(r['status'],'VALID_SECTION');self.assertEqual(r['area_mm2'],2)
    def test_coplanar_face_is_unknown(self):
        m=trimesh.creation.box();r=read_section(m.vertices[m.faces],.5,np.array([-2.,-2.]),.1,(40,40));self.assertEqual(r['reason'],'COPLANAR_FACE')
    def test_nearly_horizontal(self):
        m=trimesh.creation.box(extents=[2,2,1e-6]);m.apply_translation([3,3,0]);r=read_section(m.vertices[m.faces],1e-8,np.zeros(2),.25,(60,60));self.assertEqual(r['status'],'VALID_SECTION');self.assertEqual(r['area_mm2'],4)
    def test_plane_tangency(self):
        v=np.array([[2,2,0],[1,1,1],[3,1,1],[2,3,1]],float);f=np.array([[0,1,2],[0,2,3],[0,3,1],[1,3,2]])
        r=read_section(v[f],0,np.zeros(2),.25,(60,60));self.assertEqual(r['status'],'VALID_SECTION');self.assertEqual(len(r['cells']),0)
    def test_decimal_plane_vertex_not_false_microsegment(self):
        v=np.array([[2.371934,2.613747,.1234567],[1.382721,1.193237,1.4123123],[3.272531,1.129341,1.517231],[2.323947,3.192717,1.612321]])
        f=np.array([[0,1,2],[0,2,3],[0,3,1],[1,3,2]])
        r=read_section(v[f],v[0,2],np.zeros(2),.25,(60,60));self.assertEqual(r['status'],'VALID_SECTION');self.assertEqual(len(r['cells']),0)
    def test_unknown_is_not_empty_demand(self):
        with tempfile.TemporaryDirectory() as t:
            write(Path(t)/'SOURCE.json',dict(shape=[2,2],dz_mm=.1,unknown_sections=1))
            with self.assertRaisesRegex(ValueError,'UNKNOWN_SECTION'):demands(t,np.zeros((2,2,2),bool))
    def test_reader_change_invalidates_downstream(self):
        old=detector_identity()
        with patch('tools.authored_support.minil.lowz.before_cache.reader_identity',return_value={'sha256':'different'}):
            self.assertNotEqual(old,detector_identity())

if __name__=='__main__':unittest.main()
