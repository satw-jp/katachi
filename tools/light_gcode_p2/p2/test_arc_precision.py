import math
import unittest

import continuous_area as ca
import light_gcode_diagnostic as d


class ArcPrecisionTests(unittest.TestCase):
    @staticmethod
    def half_circle():
        return d.Move(1,1,2.,0.,-2.,0.,.2,.2,1.,.4,'Inner wall',None,'G3',-2.,0.,None,.2,.2)

    def test_original_arc_measure_and_chord_envelopes_contain_analytic_area(self):
        move=self.half_circle()
        parts,issue=d.arc_reporting_parts(move,math.pi/32)
        self.assertIsNone(issue)
        self.assertEqual(len(parts),64)
        exact_length=math.pi*2.
        self.assertAlmostEqual(sum(p['length_mm'] for p in parts),exact_length,places=12)
        radius=.2
        for p in parts:
            x0,y0=p['p0'];x1,y1=p['p1'];chord=math.hypot(x1-x0,y1-y0)
            arc_area=2*radius*p['length_mm']+math.pi*radius*radius
            eps=p['epsilon_mm']
            lo_r=max(0.,radius-eps);hi_r=radius+eps
            area_lower=2*lo_r*chord+math.pi*lo_r*lo_r
            area_upper=2*hi_r*chord+math.pi*hi_r*hi_r
            self.assertLessEqual(area_lower,arc_area+1e-12)
            self.assertGreaterEqual(area_upper,arc_area-1e-12)

    def test_fixed_source_intervals_have_no_opposite_certainty_under_bound_refinement(self):
        move=self.half_circle()
        parts,_=d.arc_reporting_parts(move,math.pi/32)
        base_sag=max(p['sagitta_mm'] for p in parts)
        refinements=(.005,.0025,base_sag)
        result_sets=[]
        for envelope in refinements:
            # Prior deposition matches exactly the first half of the target
            # circle. The other half has no donor. The analytic tube oracle is
            # therefore 1 for a matching interval and 0 for a remote interval.
            s=ca.AreaBoundsScreen(max_nodes_per_footprint=20000)
            s.set_layer(1,.2)
            half=len(parts)//2
            for p in parts[:half]:
                e=max(envelope,p['sagitta_mm'])
                s.segment(*p['p0'],*p['p1'],.4,.2,10,epsilon=e)
            s.commit_move()
            s.set_layer(2,.4)
            labels=[]
            for p in parts:
                e=max(envelope,p['sagitta_mm'])
                code,details=s.segment(*p['p0'],*p['p1'],.4,.4,20,epsilon=e)
                labels.append(d.STATUS[code])
                # Independent analytic coverage is 1 on exact match and 0
                # with no overlapping donor. The computed interval bounds
                # must contain each exact value for the corresponding case.
                if p is parts[0]:
                    self.assertLessEqual(details['prior_coverage_lower'],1.)
                    self.assertGreaterEqual(details['prior_coverage_upper'],1.)
                if p is parts[-1]:
                    self.assertEqual(details['prior_coverage_lower'],0.)
                    self.assertEqual(details['prior_coverage_upper'],0.)
            s.commit_move()
            result_sets.append(labels)
        self.assertEqual(len({(p['t0'],p['t1']) for p in parts}),len(parts))
        self.assertEqual(len(result_sets[0]),len(result_sets[1]))
        self.assertEqual(len(result_sets[1]),len(result_sets[2]))
        for coarse,fine in zip(result_sets[0],result_sets[-1]):
            self.assertFalse(coarse=='SUPPORTED_TOOLPATH' and fine=='UNSUPPORTED_FIRST_EXTRUSION')
            self.assertFalse(coarse=='UNSUPPORTED_FIRST_EXTRUSION' and fine=='SUPPORTED_TOOLPATH')
        self.assertAlmostEqual(sum(p['length_mm'] for p in parts[:half]),math.pi,places=12)
        self.assertAlmostEqual(sum(p['length_mm'] for p in parts[half:]),math.pi,places=12)

    @staticmethod
    def circle_overlap_ratio(radius,distance):
        area=2*radius*radius*math.acos(distance/(2*radius))-.5*distance*math.sqrt(4*radius*radius-distance*distance)
        return area/(math.pi*radius*radius)

    def test_independent_circle_lens_brackets_arc_coverage_near_threshold(self):
        radius=.2
        def distance_for_ratio(goal):
            lo=0.;hi=2*radius
            for _ in range(80):
                mid=(lo+hi)/2
                if self.circle_overlap_ratio(radius,mid)>goal:lo=mid
                else:hi=mid
            return (lo+hi)/2
        classifications=[]
        for exact_disk_ratio in (.64,.65,.66):
            distance=distance_for_ratio(exact_disk_ratio)
            center_x=100.
            start=(center_x,0.)
            theta=1e-6;arc_radius=100.
            end=(center_x+arc_radius*math.cos(theta)-arc_radius,
                 arc_radius*math.sin(theta))
            # I=-R places the center at the origin; the short CCW arc is a
            # disk plus a strip whose exact added area is 2*r*L.
            move=d.Move(1,2,start[0],start[1],end[0],end[1],.4,.4,.01,.4,'Inner wall',None,'G3',-arc_radius,0.,None,.4,.2)
            parts,issue=d.arc_reporting_parts(move,.1)
            self.assertIsNone(issue);self.assertEqual(len(parts),1)
            part=parts[0];arc_length=arc_radius*theta
            disk_lens=self.circle_overlap_ratio(radius,distance)
            exact_lower=disk_lens*(math.pi*radius*radius)/(math.pi*radius*radius+2*radius*arc_length)
            exact_upper=(disk_lens*(math.pi*radius*radius)+2*radius*arc_length)/(math.pi*radius*radius+2*radius*arc_length)
            labels=[]
            for envelope in (.005,.0025,max(part['sagitta_mm'],1e-12)):
                s=ca.AreaBoundsScreen(area_error_fraction=.000001,max_nodes_per_footprint=300000)
                s.set_layer(1,.2)
                s.segment(center_x+distance,0.,center_x+distance,0.,.4,.2,10)
                s.commit_move();s.set_layer(2,.4)
                epsilon=max(envelope,part['sagitta_mm'])
                code,details=s.segment(*part['p0'],*part['p1'],.4,.4,20,epsilon=epsilon)
                label=d.STATUS[code];labels.append(label)
                if label=='SUPPORTED_TOOLPATH':self.assertGreaterEqual(exact_lower,.65)
                if label=='MARGINAL_SUPPORT':self.assertLess(exact_upper,.65)
            for first,second in zip(labels,labels[1:]):
                self.assertFalse(first=='SUPPORTED_TOOLPATH' and second=='UNSUPPORTED_FIRST_EXTRUSION')
                self.assertFalse(first=='UNSUPPORTED_FIRST_EXTRUSION' and second=='SUPPORTED_TOOLPATH')
            classifications.append((exact_disk_ratio,labels,exact_lower,exact_upper))
        self.assertEqual([x[1][-1] for x in classifications],['MARGINAL_SUPPORT','UNKNOWN','SUPPORTED_TOOLPATH'])

    def test_g2_and_g3_interval_boundaries_do_not_depend_on_renderer_tessellation(self):
        for op in ('G2','G3'):
            move=d.Move(1,1,2.,0.,-2.,0.,.2,.2,1.,.4,'Inner wall',None,op,-2.,0.,None,.2,.2)
            reporting,_=d.arc_reporting_parts(move,math.pi/32)
            for renderer_tolerance in (.025,.005,.001):
                pts,issue=d.arc_coords(move,renderer_tolerance)
                self.assertIsNone(issue)
                self.assertNotEqual(len(pts),len(reporting)+1)
            a=[(p['t0'],p['t1'],p['length_mm']) for p in reporting]
            b=[(p['t0'],p['t1'],p['length_mm']) for p in d.arc_reporting_parts(move,math.pi/32)[0]]
            self.assertEqual(a,b)


if __name__=='__main__':
    unittest.main(verbosity=2)
