import unittest
import numpy as np
from .local_certificate import Domain,State

class LocalTests(unittest.TestCase):
    def setup_domain(self,regions=()):
        occ=np.zeros((9,8,8),bool);occ[:,3,3]=True
        return Domain(occ,[0,0],1,regions)
    def region(self,z,box=((3.2,3.2),(3.8,3.8))):
        return dict(part='fixture',component=1,section=z,reason='OPEN',uncertainty_envelope=box)
    def cert(self,d):
        box=[[3.2,3.2],[3.8,3.8]];scope={z:box for z in range(9)}
        return d.certify(4,scope,scope,scope,scope,{z:[27] for z in range(4)},.1)
    def test_three_states(self):
        d=self.setup_domain([self.region(1)]);self.assertEqual(d.states(0,[27,0]).tolist(),[1,0]);self.assertEqual(d.states(1,[27]).tolist(),[2])
    def test_unknown_overrides_receiver(self):self.assertEqual(self.cert(self.setup_domain([self.region(3)]))['status'],'LOCAL_UNVERIFIED')
    def test_unknown_future_fourth(self):self.assertEqual(self.cert(self.setup_domain([self.region(8)]))['status'],'LOCAL_UNVERIFIED')
    def test_unknown_donor_root(self):self.assertEqual(self.cert(self.setup_domain([self.region(0)]))['status'],'LOCAL_UNVERIFIED')
    def test_unknown_between_centres(self):
        d=self.setup_domain([self.region(2,((3.85,3.85),(3.86,3.86)))]);self.assertEqual(d.states(2,[27])[0],State.KNOWN_MATERIAL);self.assertEqual(self.cert(d)['status'],'LOCAL_UNVERIFIED')
    def test_distant_unknown_not_global_block(self):self.assertEqual(self.cert(self.setup_domain([self.region(2,((6,6),(7,7)))]))['status'],'UNKNOWN_EXCLUSION_PASS_CAD_SAMPLES')
    def test_missing_scope(self):
        d=self.setup_domain();self.assertEqual(d.certify(4,{}, {}, {}, {}, {}, .1)['status'],'LOCAL_UNVERIFIED')
    def test_outside_domain(self):self.assertEqual(self.setup_domain().states(-1,[27])[0],State.UNKNOWN);self.assertTrue(self.setup_domain().conflicts(1,[[-1,0],[1,1]]))
    def test_future_donor_not_root(self):
        d=self.setup_domain();d.occupied[0]=False;self.assertEqual(self.cert(d)['status'],'LOCAL_UNVERIFIED')
    def test_missing_donor_layer(self):
        d=self.setup_domain();d.occupied[2]=False;self.assertEqual(self.cert(d)['status'],'LOCAL_UNVERIFIED')
    def test_no_native_or_generation_claim(self):
        r=self.cert(self.setup_domain());self.assertFalse(r['generation_authorized']);self.assertFalse(r['print_go'])
    def test_nonfinite_halo_cannot_clear(self):
        d=self.setup_domain()
        with self.assertRaisesRegex(ValueError,'INVALID_QUERY'):d.conflicts(1,[[3,3],[4,4]],float('nan'))
        self.assertEqual(d.certify(4,{},{},{},{},{},float('nan'))['status'],'LOCAL_UNVERIFIED')

if __name__=='__main__':unittest.main()
