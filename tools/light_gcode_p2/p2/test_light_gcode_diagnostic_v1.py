import io
import math
import unittest

import light_gcode_diagnostic as d

HASH='a'*64


def run(s,grid=.1,zmax=50):
    return d.analyze_stream(io.StringIO(s),HASH,HASH,zmax=zmax,screen_step=grid)

PREFIX='''G90
G21
M83
G1 X10 Y10 Z0.2
; CHANGE_LAYER
; Z_HEIGHT: 0.2
; LAYER_HEIGHT: 0.2
; layer num/total_layer_count: 1/3
; FEATURE: Support
; LINE_WIDTH: 0.5
G1 X11 Y10 E1
'''
SECOND='''; CHANGE_LAYER
; Z_HEIGHT: 0.4
; LAYER_HEIGHT: 0.2
; layer num/total_layer_count: 2/3
G1 X10 Y10 Z0.4
; FEATURE: Inner wall
; LINE_WIDTH: 0.5
'''

class GcodeParserTests(unittest.TestCase):
    def test_relative_e_and_absolute_e_G92(self):
        r=d.Reader()
        for i,s in enumerate(['G90','G21','G1 X10 Y10 Z0.2','; Z_HEIGHT: 0.2','; layer num/total_layer_count: 1/2','; FEATURE: Support','; LINE_WIDTH: 0.5','M83','G1 X11 E.5','M82','G92 E10'],1):
            m=r.line(s,i)
        m=r.line('G1 X12 E11',12)
        self.assertEqual((m.x0,m.x1,m.de),(11.,12.,1.))
        m=r.line('G1 X13 E10',13)
        self.assertIsNone(m)
        self.assertEqual(r.e,10)

    def test_relative_xy_and_absolute(self):
        r=d.Reader()
        for i,s in enumerate(['G90','M83','G1 X10 Y10 Z0.2','; Z_HEIGHT: 0.2','; layer num/total_layer_count: 1/3','; FEATURE: Support','; LINE_WIDTH: .5','G91'],1):r.line(s,i)
        m=r.line('G1 X1 E.05',9)
        self.assertEqual((m.x0,m.x1),(10,11))

    def test_arc_IJ_full_midpoint_not_straight_chord(self):
        r=d.Reader()
        for i,s in enumerate(['G90','M83','G1 X10 Y10 Z0.2','; Z_HEIGHT: 0.2','; LAYER_HEIGHT: 0.2','; layer num/total_layer_count: 1/3','; FEATURE: Support','; LINE_WIDTH: 0.5'],1):r.line(s,i)
        m=r.line('G3 X12 Y10 I1 J0 E1',9)
        coords,err=d.arc_coords(m)
        self.assertIsNone(err)
        self.assertGreater(len(coords),4)
        self.assertTrue(abs(min(y for x,y in coords)-9)<.02)

    def test_arc_R_minor_and_major(self):
        template=d.Move(1,1,10,10,12,10,.2,.2,1,.5,'Support',None,'G3',None,None,2,.2,.2)
        minor,e=d.arc_coords(template);self.assertIsNone(e)
        template.r=-2
        major,e=d.arc_coords(template);self.assertIsNone(e)
        self.assertGreater(len(major),len(minor))

    def test_arc_center_missing_is_unknown_not_chord(self):
        a=run(PREFIX+'G2 X12 Y10 E.1\n')
        self.assertEqual(a['counts']['UNKNOWN'],1)
        self.assertGreater(a['unknown_reasons']['ARC_CENTER_MISSING'],0)

    def test_zero_or_missing_width_unknown(self):
        a=run(PREFIX+SECOND+'; FEATURE: Outer wall\nG1 X12 E1\n')
        self.assertEqual(a['counts']['UNKNOWN'],1)
        self.assertIn('MISSING_OR_INVALID_LINE_WIDTH_OR_XYZ',a['unknown_reasons'])

    def test_root_layer_and_previous_layer(self):
        a=run(PREFIX+SECOND+'G1 X11 Y10 E1\n')
        self.assertEqual(a['counts']['TOTAL_POSITIVE_MOVES'],2)
        self.assertEqual(a['counts']['SUPPORTED_TOOLPATH'],2)
        self.assertEqual(a['first_body_extrusion']['layer'],2)

    def test_unsupported_first_extrusion_separate_from_previous(self):
        a=run(PREFIX+SECOND+'G1 X30 Y30\nG1 X31 Y30 E1\n')
        self.assertEqual(a['counts'].get('UNSUPPORTED_FIRST_EXTRUSION',0),0)
        self.assertGreater(a['counts']['UNKNOWN'],0)
        self.assertGreater(a['counts']['LENGTH_MM_UNSUPPORTED_FIRST_EXTRUSION'],0)
        self.assertEqual(a['counts']['SUPPORTED_TOOLPATH'],1)

    def test_uncertain_previous_never_certifies_future(self):
        s=PREFIX+SECOND+'G1 X30 Y30\nG1 X31 Y30 E1\n'+'''\n; Z_HEIGHT: 0.6\n; LAYER_HEIGHT: 0.2\n; layer num/total_layer_count: 3/3\nG1 X30 Y30 Z0.6\n; FEATURE: Inner wall\n; LINE_WIDTH: 0.5\nG1 X31 Y30 E1\n'''
        a=run(s)
        self.assertEqual(a['counts'].get('UNSUPPORTED_FIRST_EXTRUSION',0),0)
        self.assertGreater(a['counts']['LENGTH_MM_UNSUPPORTED_FIRST_EXTRUSION'],0)
        self.assertGreaterEqual(a['counts']['UNKNOWN'],1)
        self.assertEqual(a['counts']['SUPPORTED_TOOLPATH'],1)

    def test_same_layer_future_not_credited(self):
        s=PREFIX+SECOND+'G1 X30 Y30\nG1 X31 Y30 E1\nG1 X30 Y30\nG1 X31 Y30 E1\n'
        a=run(s)
        self.assertEqual(a['counts'].get('UNSUPPORTED_FIRST_EXTRUSION',0),0)
        self.assertGreater(a['counts']['LENGTH_MM_UNSUPPORTED_FIRST_EXTRUSION'],0)
        self.assertGreaterEqual(a['counts']['UNKNOWN'],1)

    def test_y_only_paths_and_same_layer_earlier_accepted_are_marginal(self):
        s=PREFIX+SECOND+'G1 X10 Y10 Z0.4\nG1 X11 Y10 E.4\nG1 X12 Y10 E.4\n'
        a=run(s)
        self.assertGreater(a['counts']['LENGTH_MM_MARGINAL_SUPPORT'],0)
        self.assertGreaterEqual(a['counts']['UNKNOWN'],1)  # marginal is not certified for later spans

    def test_repaired_geometry_never_inferred(self):
        s=PREFIX+SECOND+'G1 X50 Y50\nG1 X51 Y50 E.4\n'
        a=run(s)
        event=next(r for r in a['examples'] if r['move_summary']['known_unsupported_length_mm']>0)
        self.assertEqual(event['classification'],'UNKNOWN')
        self.assertEqual(event['certainty'],'UNCERTAIN')
        self.assertEqual(event['cad_binding']['status'],'UNBOUND')
        self.assertIsNone(event['cad_binding']['flower_id'])
        self.assertEqual(event['generator_bridge']['status'],'NOT_EMITTED')

    def test_same_layer_brace_future_not_credited(self):
        s=PREFIX+SECOND+'G1 X30 Y30\nG1 X31 Y30 E1\nG1 X10 Y10\nG1 X31 Y30 E1\n'
        a=run(s)
        self.assertEqual(a['examples'][0]['cad_binding']['geometry_transform'],None)

    def test_root_is_software_only(self):
        a=run(PREFIX)
        self.assertIn('software bed-rooted only',a['receiver_rule'])

    def test_unsupported_g_motion_invalidates_position_until_xyz_reseed(self):
        r=d.Reader()
        for i,s in enumerate(['G90','M83','G1 X10 Y10 Z0.2','; layer num/total_layer_count: 1/3','G5 X11 Y10 E1'],1):r.line(s,i)
        self.assertIsNone(r.x);self.assertIsNone(r.y);self.assertIsNone(r.z)
        # No explicit XYZ: do not trust stale or partial coordinates.
        self.assertIsNone(r.line('G1 X12 E2',6))
        self.assertFalse(r.coordinates_valid)
        # First positive extrusion at an explicit reseed remains unlocated.
        self.assertIsNone(r.line('G1 X20 Y20 Z0.2 E3',7))
        self.assertTrue(r.coordinates_valid)
        m=r.line('G1 X21 Y20 E4',8)
        self.assertEqual((m.x0,m.x1),(20.,21.))
        self.assertEqual(r.errors['UNSUPPORTED_EXTRUSION_OPCODE'],1)
        self.assertEqual(r.errors['NO_INITIAL_COORDINATES'],2)
        self.assertEqual([x['line'] for x in r.rejected_extrusions],[5,6,7])

    def test_absolute_axes_reseed_independently_after_unknown_motion(self):
        r=d.Reader()
        for i,s in enumerate(['G90','M83','G1 X10 Y10 Z0.2','; layer num/total_layer_count: 1/3','G28'],1):r.line(s,i)
        self.assertEqual((r.x,r.y,r.z),(None,None,None))
        self.assertIsNone(r.line('G1 X20 E1',6))
        self.assertEqual((r.x,r.y,r.z),(20.,None,None))
        self.assertIsNone(r.line('G1 Y30',7))
        self.assertEqual((r.x,r.y,r.z),(20.,30.,None))
        self.assertIsNone(r.line('G1 Z0.2 E2',8))
        self.assertTrue(r.coordinates_valid)
        move=r.line('G1 X21 E3',9)
        self.assertEqual((move.x0,move.y0,move.x1,move.y1),(20.,30.,21.,30.))
        self.assertEqual([x['line'] for x in r.rejected_extrusions],[6,8])

    def test_absolute_arc_center_mode_is_unknown_and_plane_is_not_xy(self):
        r=d.Reader()
        for i,s in enumerate(['G90','M83','G1 X10 Y10 Z0.2','; Z_HEIGHT: 0.2','; LAYER_HEIGHT: 0.2','; layer num/total_layer_count: 1/3','; FEATURE: Support','; LINE_WIDTH: 0.5','G90.1'],1):r.line(s,i)
        m=r.line('G2 X12 Y10 I11 J10 E1',10)
        self.assertEqual(m.unsupported_reason,'ABSOLUTE_ARC_CENTER_MODE_UNSUPPORTED')
        pts,issue=d.pieces(m,.2);self.assertEqual(issue,m.unsupported_reason);self.assertEqual(pts,[(10.,10.),(12.,10.)])
        r.line('G91.1',11);r.line('G18',12)
        m=r.line('G2 X14 Y10 I1 J0 E2',13)
        self.assertEqual(m.unsupported_reason,'NON_XY_ARC_PLANE')

    def test_full_circle_ij_is_retained_and_raft_is_only_software_root(self):
        m=d.Move(1,1,10,10,10,10,.2,.2,1,.5,'Support',None,'G2',0,1,None,.2,.2)
        pts,issue=d.arc_coords(m)
        self.assertIsNone(issue);self.assertGreater(len(pts),10)
        a=run(PREFIX)
        self.assertEqual(a['root_layers'],1)
        self.assertIn('software bed-rooted only',a['receiver_rule'])


if __name__=='__main__':unittest.main(verbosity=2)
