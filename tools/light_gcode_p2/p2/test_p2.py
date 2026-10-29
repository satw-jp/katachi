import unittest,math,random,importlib.util,json
from pathlib import Path
import continuous_area as ca
import light_gcode_diagnostic as d
from polygon_bounds import coverage_bounds

class P2Tests(unittest.TestCase):
 def test_modal_width_only_verified_producer(self):
  for header,expected in [('; BambuStudio 02.08.02.61',.42),('; BambuStudio 99.99',None),('; other',None)]:
   r=d.Reader()
   for n,s in enumerate([header,'; FEATURE: Outer wall','; LINE_WIDTH: 0.42','; FEATURE: Internal solid infill'],1):r.line(s,n)
   self.assertEqual(r.width,expected)
 def test_modal_width_requires_previous_valid_value_and_updates(self):
  r=d.Reader();r.line('; BambuStudio 02.08.02.61',2);r.line('; FEATURE: X',3);self.assertIsNone(r.width)
  r.line('; LINE_WIDTH: .42',4);r.line('; FEATURE: Y',5);self.assertEqual(r.width_source_line,4)
  r.line('; LINE_WIDTH: .51',6);self.assertEqual(r.width,.51)
  r.line('; LINE_WIDTH: 0',7);r.line('; FEATURE: Z',8);self.assertIsNone(r.width)
 def test_late_header_cannot_enable_modal_policy(self):
  r=d.Reader();r.line('; BambuStudio 02.08.02.61',100);r.line('; LINE_WIDTH: .42',101);r.line('; FEATURE: X',102);self.assertIsNone(r.width)
 def test_polygon_bounds_contain_analytic_capsule(self):
  for length in (.4,.6,.8):
   exact=(.2*length+math.pi*.1**2)/(.2+math.pi*.1**2)
   result=coverage_bounds(0,0,1,0,.1,[dict(x0=0,y0=0,x1=length,y1=0,r=.1)],q=64)
   self.assertLessEqual(result[0],exact);self.assertGreaterEqual(result[1],exact)
 def test_independent_refinement_is_opt_in_and_preserves_budget_hold(self):
  donor=[dict(x0=0,y0=0,x1=.6,y1=0,r=.1)]
  old=ca.AreaBoundsScreen();new=ca.AreaBoundsScreen(independent_refinement=True)
  self.assertLess(old._coverage_bounds(0,0,1,0,.1,donor)[0],.65)
  self.assertGreater(new._coverage_bounds(0,0,1,0,.1,donor)[0],.65)
  limited=ca.AreaBoundsScreen(independent_refinement=True,max_nodes_per_footprint=1)
  self.assertTrue(limited._coverage_bounds(0,0,1,0,.1,donor)[-1])
 def test_compiled_intersections_equal_reference_order_and_ids(self):
  path=Path(__file__).parents[1]/'p1/continuous_area.py';spec=importlib.util.spec_from_file_location('reference_ca',path);ref=importlib.util.module_from_spec(spec);spec.loader.exec_module(ref)
  rng=random.Random(6602)
  for _ in range(100):
   target=[rng.uniform(-2,2) for _ in range(4)]+[.2,.005]
   donors=[dict(zip(('x0','y0','x1','y1'),[rng.uniform(-3,3) for _ in range(4)]),r=.2,epsilon=.005,kind='UNKNOWN_DIRECT',root_id=i) for i in range(25)]
   a=ref.AreaBoundsScreen._overlapping_candidates(*target,donors);b=ca.AreaBoundsScreen._overlapping_candidates(*target,donors)
   self.assertEqual([x['root_id'] for x in a],[x['root_id'] for x in b])

if __name__=='__main__':unittest.main()
