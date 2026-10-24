"""Square-cell inner/outer bounds of round bead sweeps, not centreline support.

Distance to the arc polyline is bounded by sag plus rounded-radius mismatch.
The half-cell diagonal accounts for every point of a cell. Inner and outer
coverage ratios bound area overlap; nominal centre samples are diagnostic only.
"""
import math
import numpy as np
RAW_OUT=1;RAW_IN=2;GOOD_OUT=4;GOOD_IN=8;RAW_NOM=16;GOOD_NOM=32

def raster(m,pitch=.05,extent=256.):
    p=np.asarray(m['points'],float);r=m['width']/2;err=m.get('approx_error',0)+1e-7;pad=r+err+pitch/math.sqrt(2)
    lo=np.floor((p.min(0)-pad)/pitch).astype(int);hi=np.floor((p.max(0)+pad)/pitch).astype(int)
    n=int(math.ceil(extent/pitch))
    if np.any(lo<0) or np.any(hi>=n):raise ValueError('EXTRUSION_OUTSIDE_DIAGNOSTIC_FRAME')
    yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];x=(xx+.5)*pitch;y=(yy+.5)*pitch;d2=np.full(x.shape,np.inf)
    for a,b in zip(p,p[1:]):
        dx,dy=b-a;den=dx*dx+dy*dy
        t=np.clip(((x-a[0])*dx+(y-a[1])*dy)/den,0,1) if den else 0
        np.minimum(d2,(x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2,out=d2)
    outer=d2<=(r+pitch/math.sqrt(2)+err)**2
    inner=d2<=max(0,r-pitch/math.sqrt(2)-err)**2 if r>pitch/math.sqrt(2)+err else np.zeros_like(outer)
    nominal=d2<=r*r
    if m.get('uncertain_deposition'):inner=np.zeros_like(inner);nominal=np.zeros_like(nominal)
    return (slice(lo[1],hi[1]+1),slice(lo[0],hi[0]+1)),outer,inner,nominal

def coverage(outer,inner,nominal,receiver,obit,ibit,nbit):
    lower=float(np.count_nonzero(inner & ((receiver&ibit)!=0))/max(1,outer.sum()))
    upper=min(1.,float(np.count_nonzero(outer & ((receiver&obit)!=0))/max(1,inner.sum())))
    nominal_value=float(np.count_nonzero(nominal & ((receiver&nbit)!=0))/max(1,nominal.sum()))
    return dict(lower=lower,upper=upper,nominal=nominal_value)

def classify(m,previous,same,outer,inner,nominal,threshold=.5,bed=False):
    raw=previous|same;trusted=previous|same
    all_cov=coverage(outer,inner,nominal,raw,RAW_OUT,RAW_IN,RAW_NOM)
    prev_cov=coverage(outer,inner,nominal,previous,GOOD_OUT,GOOD_IN,GOOD_NOM)
    same_cov=coverage(outer,inner,nominal,same,GOOD_OUT,GOOD_IN,GOOD_NOM)
    total_cov=coverage(outer,inner,nominal,trusted,GOOD_OUT,GOOD_IN,GOOD_NOM)
    if m.get('errors'):label='UNKNOWN';reason=';'.join(m['errors'])
    elif bed:label='SUPPORTED_TOOLPATH';reason='BED_CONTACT_ASSUMPTION_NOT_ADHESION_PROOF'
    elif not inner.any():label='UNKNOWN';reason='SUBGRID_FOOTPRINT'
    elif all_cov['upper']==0:label='UNSUPPORTED_FIRST_EXTRUSION';reason='NO_EARLIER_MATERIAL_WITHIN_OUTER_BOUNDS'
    elif prev_cov['lower']>0 and total_cov['lower']>=threshold:label='SUPPORTED_TOOLPATH';reason='CONSERVATIVE_GEOMETRIC_COVERAGE_NOT_PHYSICAL_PASS'
    elif prev_cov['lower']>0 and total_cov['upper']<threshold:label='MARGINAL_SUPPORT';reason='PARTIAL_ROOTED_RECEIVER'
    elif prev_cov['lower']==0 and same_cov['lower']>0:label='UNKNOWN';reason='SAME_LAYER_CONTACT_ONLY_NOT_VERTICAL_SUPPORT'
    elif total_cov['upper']==0:label='UNKNOWN';reason='ONLY_UNVERIFIED_OR_FLOATING_PREDECESSORS'
    else:label='UNKNOWN';reason='COVERAGE_BOUND_OR_ROOT_AMBIGUITY'
    return dict(category=label,reason=reason,raw_earlier=all_cov,prior_rooted=prev_cov,same_earlier_rooted=same_cov,total_rooted=total_cov,
                sensitivity={str(t):'PASS_COVERAGE' if prev_cov['lower']>0 and total_cov['lower']>=t else 'NOT_PROVEN' for t in (.25,.5,.75)})

def deposit(view,outer,inner,nominal,trusted):
    view[outer]|=RAW_OUT;view[inner]|=RAW_IN;view[nominal]|=RAW_NOM
    if trusted:view[outer]|=GOOD_OUT;view[inner]|=GOOD_IN;view[nominal]|=GOOD_NOM
