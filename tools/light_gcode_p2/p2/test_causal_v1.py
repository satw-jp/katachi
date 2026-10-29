import io
import json
import math
import unittest
from unittest.mock import patch

import light_gcode_diagnostic as d

H = 'a' * 64


def analyze(text, **kw):
    sink = io.StringIO()
    result = d.analyze_stream(io.StringIO(text), H, H, event_sink=sink, **kw)
    return result, [json.loads(x) for x in sink.getvalue().splitlines()]


PREFIX = '''G90
G21
M83
G1 X10 Y10 Z0.2
; Z_HEIGHT: 0.2
; LAYER_HEIGHT: 0.2
; layer num/total_layer_count: 1/3
; FEATURE: Support
; LINE_WIDTH: 0.5
'''


class CausalV1Tests(unittest.TestCase):
    def test_prior_unknown_local_propagation_and_remote_unsupported(self):
        text = PREFIX + '''G1 X11 Y10 E1
; FEATURE: Outer wall
; LINE_WIDTH: 0
G1 X12 Y10 E1
; CHANGE_LAYER
; Z_HEIGHT: 0.4
; LAYER_HEIGHT: 0.2
; layer num/total_layer_count: 2/3
G1 X10 Y10 Z0.4
; FEATURE: Inner wall
; LINE_WIDTH: 0.5
G1 X12 Y10 E1
G1 X30 Y30
G1 X30.1 Y30 E0.1
'''
        result, events = analyze(text, screen_step=.2)
        root = result['direct_unknown_roots'][0]
        propagated = next(e for e in events if e['move_summary']['unknown_move_cause_partition'] == 'UNKNOWN_PROPAGATED')
        self.assertEqual(propagated['segments'][0]['origin_line'], root['source_line'])
        self.assertEqual(propagated['source_event']['layer'], 2)
        remote = events[-1]
        self.assertEqual(remote['classification'], 'UNSUPPORTED_FIRST_EXTRUSION')
        self.assertGreater(remote['move_summary']['known_unsupported_length_mm'], 0)
        self.assertEqual(result['unknown_move_cause_flags'].get('moves_with_multiple_unknown_causes', 0), 0)

    def test_move_summary_uncertainty_precedes_unsupported_and_preserves_lengths(self):
        text = PREFIX + 'G1 X11 Y10 E1\n'
        details = {'footprint_cells': 5, 'prev_cert_cells': 0, 'prev_uncert_cells': 0, 'same_cert_cells': 0,
                   'same_uncert_cells': 0, 'prior_coverage': 0, 'same_cert_coverage': 0, 'reason': None,
                   'direct_unknown': False, 'propagated_unknown': False, 'origin_line': 0}
        with patch.object(d.Screen, 'segment', side_effect=[(2, details), (3, {**details, 'direct_unknown': True, 'reason': 'SYNTHETIC_MISSING_WIDTH', 'origin_line': 10}), (0, details), (0, details)]):
            result, events = analyze(text, screen_step=.1)
        event = events[0]
        self.assertEqual(event['observed_event'], 'OBSERVED_POSITIVE_EXTRUSION')
        self.assertEqual(event['classification'], 'UNKNOWN')
        self.assertTrue(event['move_summary']['has_unknown'])
        self.assertAlmostEqual(event['move_summary']['known_unsupported_length_mm'], .25)
        self.assertAlmostEqual(event['move_summary']['unknown_length_mm'], .25)
        self.assertAlmostEqual(event['move_summary']['known_supported_length_mm'], .5)
        self.assertEqual(event['move_summary']['unknown_move_cause_partition'], 'UNKNOWN_DIRECT')
        self.assertEqual(result['unknown_move_cause_flags']['moves_with_mixed_segment_classes'], 1)
        self.assertAlmostEqual(sum(s['length_mm'] for s in event['segments']), 1.0)

    def test_independent_circle_capsule_footprint_oracle(self):
        screen = d.Screen(step=.5, left=0, bottom=0, right=4, top=4, root_layers=1)
        screen.set_layer(1, .2)
        code, got = screen.segment(1, 1, 2, 1, 1, .2, line_no=1)
        # Independent cell-centre distance oracle, deliberately not calling _stamp.
        expected = 0
        for iy in range(8):
            for ix in range(8):
                px = (ix + .5) * .5
                py = (iy + .5) * .5
                qx = max(1, min(2, px))
                if (px-qx)**2 + (py-1)**2 <= .5**2:
                    expected += 1
        self.assertEqual(code, 0)
        self.assertEqual(got['footprint_cells'], expected)

    def test_real_geometric_mixed_unknown_and_unsupported_subsegments(self):
        # Seed a small prior-layer uncertainty island, then rasterize actual
        # contiguous straight subsegments across it. No mocked classifier.
        screen = d.Screen(step=.25, left=0, bottom=0, right=4, top=4, root_layers=1)
        screen.set_layer(2, .4)
        screen.prev_uncert[6:10, 6:10] = 1
        screen.prev_origin[6:10, 6:10] = 99
        observed = []
        for i in range(12):
            x0 = .5 + i * .25
            code, detail = screen.segment(x0, 1.875, x0 + .25, 1.875, .15, .4, 100 + i)
            observed.append((code, detail))
        self.assertIn(2, [code for code, _ in observed])
        self.assertIn(3, [code for code, _ in observed])
        self.assertTrue(all(detail['propagated_unknown'] for code, detail in observed if code == 3))
        self.assertTrue(all(detail['origin_line'] == 99 for code, detail in observed if code == 3))

    def test_propagation_preserves_direct_root_across_three_layers(self):
        text = '''G90
G21
M83
G1 X11.4 Y10 Z0.2
; Z_HEIGHT: 0.2
; LAYER_HEIGHT: 0.2
; layer num/total_layer_count: 1/3
; FEATURE: Support
; LINE_WIDTH: 0
G1 X11.6 Y10 E1
; CHANGE_LAYER
; Z_HEIGHT: 0.4
; LAYER_HEIGHT: 0.2
; layer num/total_layer_count: 2/3
G1 X11.4 Y10 Z0.4
; FEATURE: Inner wall
; LINE_WIDTH: 0.5
G1 X11.8 Y10 E1
; CHANGE_LAYER
; Z_HEIGHT: 0.6
; LAYER_HEIGHT: 0.2
; layer num/total_layer_count: 3/3
G1 X11.4 Y10 Z0.6
; FEATURE: Inner wall
; LINE_WIDTH: 0.5
G1 X11.8 Y10 E1
'''
        result, events = analyze(text, screen_step=.1)
        root_line = result['direct_unknown_roots'][0]['source_line']
        layer3 = next(e for e in events if e['source_event']['layer'] == 3)
        origins = {s['origin_line'] for s in layer3['segments'] if s['unknown_cause'] == 'UNKNOWN_PROPAGATED'}
        self.assertEqual(origins, {root_line})

    def test_provenance_contract_tracks_typed_roots_and_nonexclusive_impacts(self):
        result, _ = analyze(PREFIX + 'G1 X11 Y10 E1\n; FEATURE: Outer wall\n; LINE_WIDTH: 0\nG1 X12 Y10 E1\n', screen_step=.1)
        contract=result['provenance_contract']
        self.assertEqual(contract['roots_per_cell_max'],4)
        self.assertTrue(contract['root_impact_lengths_are_nonexclusive'])
        self.assertIn('complete',contract)
        self.assertTrue(any('UNKNOWN_DIRECT' in root['source_kinds'] for root in contract['root_sources']))

    def test_cell_root_cap_retains_known_roots_and_marks_overflow_incomplete(self):
        screen=d.Screen(step=.25,left=0,bottom=0,right=2,top=2,root_layers=1)
        screen.set_layer(2,.4)
        screen.prev_uncert[4,4]=1
        screen.prev_origin[4,4]=101
        screen.prev_roots[4,4,:]=[101,102,103,104]
        screen.prev_root_count[4,4]=4
        screen.prev_root_overflow[4,4]=1
        code,details=screen.segment(1.0,1.125,1.25,1.125,.2,.4,200)
        self.assertEqual(code,3)
        self.assertEqual(details['origin_root_lines'],[101,102,103,104])
        self.assertTrue(details['origin_root_overflow'])
        self.assertFalse(details['origin_provenance_complete'])

    def test_diagonal_and_arc_tessellation_footprints_against_independent_oracle(self):
        # Compare rasterized capsule cells against an independent cell-centre
        # geometry oracle for a diagonal and a quarter-circle arc.
        screen = d.Screen(step=.25, left=0, bottom=0, right=4, top=4, root_layers=1)
        screen.set_layer(1, .2)
        diagonal = (.75, .75, 2.75, 2.25, .4)
        code, detail = screen.segment(*diagonal[:4], diagonal[4], .2, 1)
        def capsule_count(points, radius):
            expected = 0
            for iy in range(16):
                for ix in range(16):
                    px, py = (ix + .5) * .25, (iy + .5) * .25
                    hit = False
                    for (ax, ay), (bx, by) in zip(points, points[1:]):
                        dx, dy = bx - ax, by - ay
                        t = max(0., min(1., ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)))
                        if (px-(ax+t*dx))**2 + (py-(ay+t*dy))**2 <= radius**2:
                            hit = True; break
                    expected += hit
            return expected
        self.assertEqual(code, 0)
        self.assertEqual(detail['footprint_cells'], capsule_count([(diagonal[0],diagonal[1]),(diagonal[2],diagonal[3])], .2))
        # Arc geometry is tessellated by the parser; independently test its
        # point path union against the same cell-centre capsule oracle.
        move = d.Move(lineno=2, layer=1, x0=2.5, y0=2.0, x1=2.0, y1=2.5,
                      z0=.2, z1=.2, de=1., width=.4, role='Support', object_id=None,
                      g='G3', i=-.5, j=0., r=None, z_comment=.2, layer_height=.2)
        points, issue = d.pieces(move, .25)
        self.assertIsNone(issue)
        arc_points = [(move.x0, move.y0), *points[1:]]
        screen2 = d.Screen(step=.25, left=0, bottom=0, right=4, top=4, root_layers=1)
        screen2.set_layer(1, .2)
        for (ax, ay), (bx, by) in zip(arc_points, arc_points[1:]):
            screen2.segment(ax, ay, bx, by, .4, .2, 2)
        stamped = int(screen2.cur_cert.sum())
        self.assertEqual(stamped, capsule_count(arc_points, .2))

    def test_zero_width_direct_reason_and_feature_width_reset(self):
        text = PREFIX + '''G1 X11 Y10 E1
; FEATURE: Outer wall
G1 X12 Y10 E1
'''
        result, events = analyze(text, screen_step=.2)
        self.assertEqual(result['direct_unknown_roots'][0]['reason'], 'MISSING_OR_INVALID_LINE_WIDTH_OR_XYZ')
        self.assertTrue(events[-1]['move_summary']['has_unknown'])

    def test_invalid_arc_keeps_unknown_and_does_not_call_chord_supported(self):
        text = PREFIX + 'G2 X12 Y10 E1\n'
        result, events = analyze(text, screen_step=.2)
        ev = events[0]
        self.assertEqual(ev['classification'], 'UNKNOWN')
        self.assertEqual(ev['segments'][0]['reason'], 'ARC_CENTER_MISSING')
        self.assertEqual(ev['segments'][0]['length_value_basis'], 'endpoint_chord_lower_bound_for_invalid_path')

    def test_move_endpoint_on_certified_receiver_does_not_certify_whole_path(self):
        text = PREFIX + '''G1 X11 Y10 E1
; CHANGE_LAYER
; Z_HEIGHT: 0.4
; LAYER_HEIGHT: 0.2
; layer num/total_layer_count: 2/3
G1 X30 Y10 Z0.4
; FEATURE: Inner wall
; LINE_WIDTH: 0.5
G1 X10.5 Y10 E1
'''
        _, events = analyze(text, screen_step=.2)
        event = events[-1]
        self.assertTrue(event['move_summary']['has_unknown'])
        self.assertEqual(event['certainty'], 'UNCERTAIN')
        self.assertGreater(event['move_summary']['unknown_length_mm'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
