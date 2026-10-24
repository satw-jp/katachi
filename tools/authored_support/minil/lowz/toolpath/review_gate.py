"""Read-only demand screening. No generator imports, no geometry mutation.

Raft projection is a conditional receiver, never a physical rooted-material
certificate. Component bounding boxes only shortlist ownership; UNKNOWN is
never resolved by a bounding-box or toolpath observation.
"""
import math


def slice_plane(print_z, layer_height, raft_top, raft_gap):
    """Native layer midpoint, given actual geometric layer height (not flow)."""
    if min(layer_height, raft_top) <= 0 or raft_gap < 0:
        raise ValueError('invalid layer contract')
    return print_z - raft_top - raft_gap - layer_height / 2


def raft_receiver(layer, first_object_layer, gap, declared_gap, lower, upper):
    if layer != first_object_layer or abs(gap-declared_gap) > 1e-6:
        return 'UNKNOWN_GAP_NOT_DECLARED_FIRST_OBJECT_LAYER'
    if upper == 0:
        return 'NO_PROJECTED_RAFT_RECEIVER'
    if lower <= 0:
        return 'UNKNOWN_RAFT_COVERAGE'
    return 'CONDITIONAL_RAFT_RECEIVER_NOT_PHYSICAL_PASS'


def overlap(a, b):
    return all(a[0][i] <= b[1][i] and b[0][i] <= a[1][i] for i in range(len(a[0])))


def path_bounds(motions):
    lo=[math.inf, math.inf];hi=[-math.inf,-math.inf]
    for m in motions:
        r=m['width']/2 + m.get('approx_error', 0)
        for p in m['points']:
            for i in range(2):
                lo[i]=min(lo[i],p[i]-r);hi[i]=max(hi[i],p[i]+r)
    return [lo,hi]


def neck_size_screen(first_motion, radius):
    # Necessary condition only: a vertical circular V2 neck cannot cover a
    # span whose bead bounding width exceeds its diameter. No start-point
    # placement or new contact centre is selected here.
    box=path_bounds([first_motion]);span=max(box[1][i]-box[0][i] for i in range(2))
    return dict(necessary_size_pass=span <= 2*radius,
                bead_bbox_span_mm=span,neck_diameter_mm=2*radius,
                coverage_certified=False)


def screen_event(event, neck_radius):
    size=neck_size_screen(event['motions'][0],neck_radius)
    successors=event.get('successors',[])
    continuity=len(successors)==4 and all(s['raw_overlap']>0 for s in successors)
    reasons=[]
    if not size['necessary_size_pass']:reasons.append('EXCEEDS_SINGLE_VERTICAL_NECK_NECESSARY_SIZE')
    if not continuity:reasons.append('FOUR_SUCCESSOR_RAW_CONTINUITY_NOT_OBSERVED')
    return dict(size=size,raw_four_successor_continuity=continuity,
                queue_eligible=not reasons,reasons=reasons,
                certified_for_generation=False)
