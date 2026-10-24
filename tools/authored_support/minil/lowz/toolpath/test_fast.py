import unittest,numpy as np
from .test_diagnostic import motion
from .parser import subdivide,arc_points
from .footprint import raster,classify,deposit
from .fast_footprint import evaluate

class FastTests(unittest.TestCase):
    def test_reference_identical_ordered_random_paths(self):
        rng=np.random.default_rng(924);prev=np.zeros((200,200),np.uint8);same=np.zeros_like(prev);fast=np.zeros_like(prev)
        for j in range(100):
            m=motion(tuple(rng.uniform(3,5,2)),tuple(rng.uniform(3,5,2)),float(rng.uniform(.2,.7)))
            if j%7==0:
                points,_,err,_=arc_points([4,4],[5,5],{'I':0,'J':1},False);m.update(points=points,approx_error=err)
            sl,o,i,n=raster(m,extent=10);a=classify(m,prev[sl],same[sl],o,i,n,bed=j<10);deposit(same[sl],o,i,n,a['category']=='SUPPORTED_TOOLPATH')
            b=evaluate(m,prev,fast,.05,.5,j<10)
            self.assertEqual(a,b);np.testing.assert_array_equal(same,fast)
            if j==49:prev=same.copy();same.fill(0);fast.fill(0)
    def test_span_order_and_conservation(self):
        m=dict(motion((2,2),(8,8)),length=2**.5*6,e_delta=.6,net_e=.6,first_in_path=True)
        spans=list(subdivide(m));self.assertAlmostEqual(sum(s['length'] for s in spans),m['length']);self.assertAlmostEqual(sum(s['e_delta'] for s in spans),.6)
        self.assertTrue(all(s['length']<=2.000001 for s in spans))
        for a,b in zip(spans,spans[1:]):self.assertEqual(a['points'][-1],b['points'][0])
    def test_floating_never_rooted(self):
        p=np.zeros((200,200),np.uint8);s=np.zeros_like(p);m=motion();a=evaluate(m,p,s,.05,.5,False);b=evaluate(m,s,np.zeros_like(s),.05,.5,False)
        self.assertEqual(a['category'],'UNSUPPORTED_FIRST_EXTRUSION');self.assertEqual(b['category'],'UNKNOWN')
    def test_uncertain_E_deposits_only_possible_envelope(self):
        p=np.zeros((200,200),np.uint8);s=np.zeros_like(p);m=motion();m.update(uncertain_deposition=True,errors=['NO_NET_DEPOSITION_DURING_UNRETRACTION'])
        r=evaluate(m,p,s,.05,.5,True);self.assertEqual(r['category'],'UNKNOWN');self.assertFalse(np.any(s&62));self.assertTrue(np.any(s&1))
    def test_raft_gap_preserves_material_but_not_trust(self):
        from .analyze import retain_raw_across_vertical_gap
        p=np.zeros((200,200),np.uint8);s=np.zeros_like(p);m=motion()
        evaluate(m,p,s,.05,.5,True);retain_raw_across_vertical_gap(s)
        result=evaluate(m,s,p,.05,.5,False)
        self.assertEqual(result['category'],'UNKNOWN')
        self.assertGreater(result['raw_earlier']['upper'],0)
        self.assertEqual(result['prior_rooted']['upper'],0)

if __name__=='__main__':unittest.main()
