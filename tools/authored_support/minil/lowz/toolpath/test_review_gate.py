import unittest
from .review_gate import slice_plane,raft_receiver,overlap,screen_event

class ReviewGateTests(unittest.TestCase):
    def test_phase_uses_midpoint_not_print_top(self):
        self.assertAlmostEqual(slice_plane(.7,.1,.5,.1),.05)
        self.assertAlmostEqual(slice_plane(50,.1,.5,.1),49.35)
    def test_gap_only_at_first_object_layer(self):
        self.assertTrue(raft_receiver(4,3,.1,.1,1,1).startswith('UNKNOWN'))
    def test_different_gap_not_accepted(self):
        self.assertTrue(raft_receiver(3,3,.2,.1,1,1).startswith('UNKNOWN'))
    def test_projection_not_physical_support(self):
        self.assertEqual(raft_receiver(3,3,.1,.1,.7,.9),'CONDITIONAL_RAFT_RECEIVER_NOT_PHYSICAL_PASS')
    def test_unknown_stays_unknown(self):
        self.assertEqual(raft_receiver(3,3,.1,.1,0,1),'UNKNOWN_RAFT_COVERAGE')
    def test_no_projected_receiver(self):
        self.assertEqual(raft_receiver(3,3,.1,.1,0,0),'NO_PROJECTED_RAFT_RECEIVER')
    def test_width_not_only_centreline(self):
        e=dict(motions=[dict(points=[[0,0],[.05,0]],width=.5)],successors=[dict(raw_overlap=1)]*4)
        self.assertFalse(screen_event(e,.22)['queue_eligible'])
    def test_later_raw_not_root_certificate(self):
        e=dict(motions=[dict(points=[[0,0],[.05,0]],width=.3)],successors=[dict(raw_overlap=1)]*4)
        r=screen_event(e,.22);self.assertTrue(r['queue_eligible']);self.assertFalse(r['certified_for_generation'])
    def test_missing_future(self):
        e=dict(motions=[dict(points=[[0,0],[.05,0]],width=.3)],successors=[dict(raw_overlap=1)]*3)
        self.assertFalse(screen_event(e,.22)['queue_eligible'])
    def test_unknown_touch_counts(self):
        self.assertTrue(overlap([[0,0],[1,1]],[[1,1],[2,2]]))
    def test_separate_boxes(self):
        self.assertFalse(overlap([[0,0],[1,1]],[[2,2],[3,3]]))

if __name__=='__main__':unittest.main()
