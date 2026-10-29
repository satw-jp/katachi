import io
import math
import unittest

import light_gcode_diagnostic as d
import continuous_area as ca
from continuous_area import AreaBoundsScreen, ProvenanceBudgetExceeded, RootSetPool


class ContinuousAreaTests(unittest.TestCase):
    def test_exact_collinear_capsule_overlap_is_bracketed_by_independent_formula(self):
        screen=AreaBoundsScreen(max_nodes_per_footprint=20000)
        target_area=2*.1*1+math.pi*.1*.1
        for length in (.4,.6,.8):
            true=(2*.1*length+math.pi*.1*.1)/target_area
            lo,hi,area,_,_=screen._coverage_bounds(0,0,1,0,.1,[{'x0':0,'y0':0,'x1':length,'y1':0,'r':.1,'epsilon':0}])
            self.assertAlmostEqual(area,target_area)
            self.assertLessEqual(lo,true+1e-9)
            self.assertGreaterEqual(hi,true-1e-9)

    def test_unchanged_threshold_uses_conservative_bounds(self):
        def classify(length):
            s=AreaBoundsScreen()
            s.set_layer(1,.2)
            self.assertEqual(s.segment(0,0,length,0,.2,.2,10)[0],0)
            s.commit_move();s.set_layer(2,.4)
            return s.segment(0,0,1,0,.2,.4,20)
        supported,sd=classify(.8)
        unsupported,ud=classify(.4)
        ambiguous,ad=classify(.6)
        self.assertEqual(supported,0);self.assertGreaterEqual(sd['prior_coverage_lower'],.65)
        self.assertEqual(unsupported,1);self.assertLess(ud['prior_coverage_upper'],.65)
        self.assertEqual(ambiguous,3);self.assertEqual(ad['reason'],'AREA_COVERAGE_BOUND_STRADDLES_THRESHOLD')

    def test_same_gcode_move_is_classified_atomically_before_commit(self):
        s=AreaBoundsScreen();s.set_layer(2,.4)
        first,_=s.segment(0,0,1,0,.2,.4,10,reason='DIRECT_UNKNOWN')
        second,details=s.segment(0,0,1,0,.2,.4,10)
        self.assertEqual(first,3)
        self.assertNotEqual(second,3)
        s.commit_move()
        third,details=s.segment(0,0,1,0,.2,.4,11)
        self.assertEqual(third,3)
        self.assertTrue(details['propagated_unknown'])
        s.commit_move()
        self.assertEqual(s.root_source_kinds[11],'UNKNOWN_PROPAGATED_CARRIER')

    def test_root_union_is_lossless_and_budget_exhaustion_is_explicit(self):
        s=AreaBoundsScreen(root_layers=0)
        s.set_layer(1,.2)
        s.segment(0,0,1,0,.2,.2,10,reason='U10');s.commit_move()
        s.segment(2,0,3,0,.2,.2,11,reason='U11');s.commit_move()
        s.set_layer(2,.4)
        code,details=s.segment(.5,0,2.5,0,.2,.4,12)
        self.assertEqual(code,3)
        self.assertEqual(details['origin_root_lines'],[10,11])
        pool=RootSetPool(max_distinct_sets=3,max_root_references=10)
        pool.intern([1]);pool.intern([2])
        with self.assertRaises(ProvenanceBudgetExceeded):pool.intern([3])

    def test_overlap_prefilter_matches_exact_capsule_distance(self):
        candidates=[
            {'x0':0.,'y0':.1,'x1':1.,'y1':1.1,'r':.1,'epsilon':0.,'kind':'UNKNOWN','root_id':1},
            {'x0':0.,'y0':1.,'x1':1.,'y1':2.,'r':.1,'epsilon':0.,'kind':'UNKNOWN','root_id':2},
            {'x0':3.,'y0':3.,'x1':4.,'y1':4.,'r':.1,'epsilon':0.,'kind':'UNKNOWN','root_id':3},
            {'x0':0.,'y0':0.,'x1':1.,'y1':1.,'r':.1,'epsilon':0.,'kind':'CERTIFIED','root_id':4},
        ]
        radius=.1+.02+.1+.02
        expected=[d for d in candidates if d['kind']!='CERTIFIED' and ca._segment_distance((0.,0.),(1.,1.),(d['x0'],d['y0']),(d['x1'],d['y1']))<=radius]
        actual=AreaBoundsScreen._overlapping_candidates(0.,0.,1.,1.,.1,.02,candidates)
        self.assertEqual([x['root_id'] for x in actual],[x['root_id'] for x in expected])

    def test_analyzer_ignores_raster_and_external_path_step_in_v2(self):
        text='''G90\nG21\nM83\nG1 X10 Y10 Z0.2\n; Z_HEIGHT: 0.2\n; LAYER_HEIGHT: 0.2\n; layer num/total_layer_count: 1/2\n; FEATURE: Support\n; LINE_WIDTH: 0.5\nG1 X11 Y10 E1\n; Z_HEIGHT: 0.4\n; LAYER_HEIGHT: 0.2\n; layer num/total_layer_count: 2/2\nG1 X10 Y10 Z0.4\n; FEATURE: Inner wall\n; LINE_WIDTH: 0.5\nG1 X10.8 Y10 E1\nG3 X11.2 Y10 I0.2 J0 E1\n'''
        a=d.analyze_stream(io.StringIO(text),'a'*64,'b'*64,screen_step=.1,path_step_mm=.1,geometry_mode='area_bounds_v2')
        b=d.analyze_stream(io.StringIO(text),'a'*64,'b'*64,screen_step=.2,path_step_mm=.8,geometry_mode='area_bounds_v2')
        self.assertEqual(a['schema'],'katachi.lowz.saved_gcode_diagnostic.v2.area_bounds')
        self.assertEqual(a['counts'],b['counts'])
        self.assertEqual(a['by_layer'],b['by_layer'])
        self.assertIsNone(a['grid_mm'])
        self.assertIsNone(a['path_tessellation_step_mm'])

    def test_unlocated_positive_g_event_is_a_global_typed_root(self):
        text='''G90\nM83\nG1 X10 Y10 Z0.2\n; layer num/total_layer_count: 1/2\n; Z_HEIGHT: 0.2\n; LAYER_HEIGHT: 0.2\n; LINE_WIDTH: 0.4\nG1 X11 Y10 E1\nG5 X12 Y10 E1\n; layer num/total_layer_count: 2/2\n; Z_HEIGHT: 0.4\nG1 X10 Y10 Z0.4\n; LINE_WIDTH: 0.4\nG1 X11 Y10 E1\n'''
        result=d.analyze_stream(io.StringIO(text),'a'*64,'b'*64,geometry_mode='area_bounds_v2')
        contract=result['provenance_contract']
        source=next(x for x in contract['root_sources'] if x['source_line']==9)
        self.assertIn('UNKNOWN_UNLOCATED_OR_UNSUPPORTED_POSITIVE_G',source['source_kinds'])
        self.assertEqual(result['unlocated_positive_extrusion_count'],1)
        self.assertTrue(contract['complete'])
        self.assertGreater(result['counts']['UNKNOWN'],0)


if __name__=='__main__':unittest.main()
