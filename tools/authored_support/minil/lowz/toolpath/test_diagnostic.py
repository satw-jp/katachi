import unittest,math
import numpy as np
from shapely.geometry import LineString
from .parser import motions,arc_points
from .footprint import raster,classify,deposit

HEADER='G90\nM83\nG1 X4 Y4 Z.2\n; Z_HEIGHT: 0.2\n; LAYER_HEIGHT: 0.2\n; layer num/total_layer_count: 1/5\n; FEATURE: Outer wall\n; LINE_WIDTH: 0.4\n'
def motion(a=(4,4),b=(5,4),width=.4):return dict(points=[a,b],width=width,approx_error=0,errors=[])

class ParserTests(unittest.TestCase):
    def test_relative_extrusion(self):self.assertEqual(list(motions((HEADER+'G1 X5 E.1\n').splitlines()))[0]['e_delta'],.1)
    def test_absolute_extrusion_reset(self):
        a=list(motions((HEADER+'M82\nG92 E20\nG1 X5 E20.1\nG92 E0\nG1 X6 E.2').splitlines()));self.assertAlmostEqual(a[0]['e_delta'],.1);self.assertAlmostEqual(a[1]['e_delta'],.2)
    def test_retraction_not_deposition(self):
        a=list(motions((HEADER+'G1 E-.8\nG1 E.8\nG1 X5 E.1').splitlines()));self.assertEqual(len(a),1);self.assertFalse(a[0]['errors'])
    def test_moving_unretract_bounded_not_erased(self):
        m=list(motions((HEADER+'G1 E-.8\nG1 X5 E.9').splitlines()))[0];self.assertAlmostEqual(m['retract_prefix_bound_mm'],.8/.9);self.assertAlmostEqual(m['net_e'],.1)
    def test_relative_xyz(self):self.assertEqual(list(motions((HEADER+'G91\nG1 X1 E.1').splitlines()))[0]['points'][-1],[5,4])
    def test_negative_E_not_motion(self):self.assertEqual(list(motions((HEADER+'G1 X5 E-.1').splitlines())),[])
    def test_full_circle(self):
        p,l,e,a=arc_points([4,4],[4,4],{'I':1,'J':0},False);self.assertAlmostEqual(l,2*math.pi);self.assertEqual(p[0],p[-1]);self.assertGreater(len(p),20)
    def test_radius_major_minor(self):
        _,a,_,_=arc_points([4,4],[5,4],{'R':1},False);_,b,_,_=arc_points([4,4],[5,4],{'R':-1},False);self.assertLess(a,math.pi);self.assertGreater(b,math.pi)
    def test_absolute_arc_center(self):
        _,l,_,_=arc_points([4,4],[5,5],{'I':4,'J':5},False,True);self.assertAlmostEqual(l,math.pi/2)
    def test_z_comments_not_layer_shifted(self):
        text=HEADER+'G1 X5 E.1\n; Z_HEIGHT: .3\n; LAYER_HEIGHT: .1\n; layer num/total_layer_count: 2/5\nG1 Z.3\nG1 X6 E.1'
        a=list(motions(text.splitlines()));self.assertEqual([(x['layer'],x['z']) for x in a],[(1,.2),(2,.3)])
    def test_nonplanar_flag(self):self.assertIn('NONPLANAR_OR_LAYER_Z_MISMATCH',list(motions((HEADER+'G1 X5 Z.4 E.1').splitlines()))[0]['errors'])
    def test_missing_width(self):self.assertIn('DIMENSIONS_UNBOUND',list(motions((HEADER.replace('; LINE_WIDTH: 0.4\n','')+'G1 X5 E.1').splitlines()))[0]['errors'])
    def test_travel_creates_new_path(self):
        a=list(motions((HEADER+'G1 X5 E.1\nG1 X6\nG1 X7 E.1').splitlines()));self.assertNotEqual(a[0]['uid'],a[1]['uid'])

class CoverageTests(unittest.TestCase):
    def setUp(self):self.prev=np.zeros((200,200),np.uint8);self.same=np.zeros_like(self.prev)
    def add(self,m,target,trusted=True):
        sl,o,i,n=raster(m,extent=10);deposit(target[sl],o,i,n,trusted)
    def check(self,m):
        sl,o,i,n=raster(m,extent=10);return classify(m,self.prev[sl],self.same[sl],o,i,n)
    def test_empty_unsupported(self):self.assertEqual(self.check(motion())['category'],'UNSUPPORTED_FIRST_EXTRUSION')
    def test_full_prior_supported(self):self.add(motion(),self.prev);self.assertEqual(self.check(motion())['category'],'SUPPORTED_TOOLPATH')
    def test_future_not_receiver(self):self.assertEqual(self.check(motion())['category'],'UNSUPPORTED_FIRST_EXTRUSION');self.add(motion(),self.same)
    def test_floating_not_promoted(self):self.add(motion(),self.prev,False);self.assertEqual(self.check(motion())['category'],'UNKNOWN')
    def test_same_layer_only_unknown(self):self.add(motion(),self.same);self.assertEqual(self.check(motion())['reason'],'SAME_LAYER_CONTACT_ONLY_NOT_VERTICAL_SUPPORT')
    def test_width_not_centerline(self):
        self.add(motion(width=1),self.prev);r=self.check(motion((4,4.2),(5,4.2)));self.assertEqual(r['category'],'SUPPORTED_TOOLPATH')
    def test_small_gap_not_forced_pass(self):
        self.add(motion(),self.prev);r=self.check(motion((4,4.405),(5,4.405)));self.assertNotEqual(r['category'],'SUPPORTED_TOOLPATH')
    def test_exact_overlap_within_bounds(self):
        self.add(motion(),self.prev)
        for y in (4,4.1,4.2,4.3,4.45):
            m=motion((4,y),(5,y));r=self.check(m)['prior_rooted'];a=LineString(m['points']).buffer(.2,quad_segs=64);b=LineString(motion()['points']).buffer(.2,quad_segs=64);exact=a.intersection(b).area/a.area
            self.assertLessEqual(r['lower'],exact+1e-5);self.assertGreaterEqual(r['upper']+1e-5,exact)
    def test_arc_not_chord(self):
        p,_,er,_=arc_points([4,4],[6,4],{'I':1,'J':0},False);m=motion();m.update(points=p,approx_error=er);sl,o,i,n=raster(m,extent=10)
        self.assertGreater(sl[0].stop-sl[0].start,20)
    def test_tiny_no_invented_material(self):self.assertEqual(self.check(motion(width=.01))['reason'],'SUBGRID_FOOTPRINT')

if __name__=='__main__':unittest.main()
