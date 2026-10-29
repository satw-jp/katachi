import io,unittest
from followup_extrusions import annotate, sqdist_point_segment

class FutureTests(unittest.TestCase):
    def test_geometric_distance(self):
        self.assertEqual(sqdist_point_segment(1,1,(0,0),(2,0)),1)
    def test_future_deposition_not_assigned_as_prior_support(self):
        event={'source_event':{'layer':2,'gcode_line':20},'machine':{'x0':10.,'y0':10.,'x1':11.,'y1':10.,'z_mm':.4}}
        data='''G90\nM83\nG1 X10 Y10 Z0.2\n; Z_HEIGHT: 0.2\n; LAYER_HEIGHT: 0.2\n; layer num/total_layer_count: 1/4\n; FEATURE: Support\n; LINE_WIDTH: 0.5\nG1 X11 E.4\n; Z_HEIGHT: 0.4\n; layer num/total_layer_count: 2/4\nG1 Z0.4\n; FEATURE: Inner wall\n; LINE_WIDTH: 0.5\nG1 X10 E.4\n; Z_HEIGHT: 0.6\n; layer num/total_layer_count: 3/4\nG1 Z0.6\n; FEATURE: Inner wall\n; LINE_WIDTH: 0.5\nG1 X11 E.4\n'''
        out=annotate(io.StringIO(data),[event],extra_layers=2)
        self.assertEqual(out[0]['post_four_deposition']['layers_with_later_extrusion'],1)
        self.assertEqual(out[0]['post_four_deposition']['support_certification'],'UNVERIFIED')

if __name__=='__main__':unittest.main()
