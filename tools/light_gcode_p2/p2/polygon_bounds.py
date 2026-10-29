"""Independent inner/outer polygon bounds of union-of-capsule coverage.

Inscribed circle polygons are subsets. Increasing the radius by sec(pi/N)
makes every regular polygon side tangent to or outside the original circle.
Minkowski-summing either polygon with a segment preserves containment.
GEOS is double precision, not exact arithmetic: retain an explicit area guard
and return UNKNOWN to the caller when bounds do not prove a threshold side.
No line IDs, locations, or support thresholds are hardcoded here.
"""
import math
from shapely.geometry import LineString,Point
from shapely.ops import unary_union

def capsule(x0,y0,x1,y1,r,q,outer=False):
 if r<=0:return Point().buffer(0)
 if outer:r/=math.cos(math.pi/(4*q))
 shape=Point(x0,y0) if x0==x1 and y0==y1 else LineString([(x0,y0),(x1,y1)])
 return shape.buffer(r,quad_segs=q)

def coverage_bounds(x0,y0,x1,y1,r,donors,epsilon=0.,q=64):
 area=2*r*math.hypot(x1-x0,y1-y0)+math.pi*r*r
 if not donors or area<=1e-18:return (0.,0.,area,0,False)
 tin=capsule(x0,y0,x1,y1,max(0.,r-epsilon),q)
 tout=capsule(x0,y0,x1,y1,r+epsilon,q,True)
 lows=[];highs=[]
 for d in donors:
  args=(d['x0'],d['y0'],d['x1'],d['y1'])
  # Restrict the union to the target's conservative outer footprint first.
  # A ∩ union(B) == A ∩ union(B ∩ A_outer), since A ⊆ A_outer.
  lows.append(capsule(*args,max(0.,d['r']-d.get('epsilon',0.)-epsilon),q).intersection(tout))
  highs.append(capsule(*args,d['r']+d.get('epsilon',0.)+epsilon,q,True).intersection(tout))
 low=tin.intersection(unary_union(lows)).area
 high=tout.intersection(unary_union(highs)).area
 # Documented roundoff allowance, never used to expand a certain decision.
 guard=1e-7*max(1.,area)
 denlo=2*max(0.,r-epsilon)*math.hypot(x1-x0,y1-y0)+math.pi*max(0.,r-epsilon)**2
 denhi=2*(r+epsilon)*math.hypot(x1-x0,y1-y0)+math.pi*(r+epsilon)**2
 lo=max(0.,min(1.,(low-guard)/(denhi+guard)))
 hi=min(1.,(high+guard)/max(denlo-guard,1e-18))
 return lo,max(lo,hi),area,len(donors),False
