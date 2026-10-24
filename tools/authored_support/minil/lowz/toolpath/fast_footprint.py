"""Compiled equivalent of footprint.py; same bounds and order, no fast-math."""
import math
import numpy as np
from numba import njit

@njit(cache=True)
def kernel(previous,same,points,width,error,pitch,threshold,bed,uncertain):
    r=width/2;er=error+1e-7;pad=r+er+pitch/math.sqrt(2)
    x0=int(math.floor((points[:,0].min()-pad)/pitch));x1=int(math.floor((points[:,0].max()+pad)/pitch))
    y0=int(math.floor((points[:,1].min()-pad)/pitch));y1=int(math.floor((points[:,1].max()+pad)/pitch))
    if x0<0 or y0<0 or x1>=same.shape[1] or y1>=same.shape[0]:raise ValueError('EXTRUSION_OUTSIDE_DIAGNOSTIC_FRAME')
    flags=np.zeros((y1-y0+1,x1-x0+1),np.uint8);s=np.zeros((5,3),np.int64)
    ro=(r+pitch/math.sqrt(2)+er)**2;ri=max(0,r-pitch/math.sqrt(2)-er)**2
    for y in range(y0,y1+1):
        yy=(y+.5)*pitch
        for x in range(x0,x1+1):
            xx=(x+.5)*pitch;d2=math.inf
            for k in range(len(points)-1):
                a=points[k];b=points[k+1];dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
                t=min(1.,max(0.,((xx-a[0])*dx+(yy-a[1])*dy)/den)) if den else 0.
                d2=min(d2,(xx-a[0]-t*dx)**2+(yy-a[1]-t*dy)**2)
            o=d2<=ro;i=d2<=ri and r>pitch/math.sqrt(2)+er and not uncertain;n=d2<=r*r and not uncertain
            if not o:continue
            flag=1|(2 if i else 0)|(16 if n else 0);flags[y-y0,x-x0]=flag
            s[0,0]+=1;s[0,1]+=i;s[0,2]+=n
            prior=previous[y,x];cur=same[y,x];combined=prior|cur
            for j in range(1,5):
                bits=combined if j in (1,4) else (prior if j==2 else cur)
                ob=1 if j==1 else 4;ib=2 if j==1 else 8;nb=16 if j==1 else 32
                s[j,0]+=int((bits&ob)!=0);s[j,1]+=int(i and (bits&ib)!=0);s[j,2]+=int(n and (bits&nb)!=0)
    c=np.zeros((4,3),np.float64)
    for j in range(4):
        c[j,0]=s[j+1,1]/max(1,s[0,0]);c[j,1]=min(1.,s[j+1,0]/max(1,s[0,1]));c[j,2]=s[j+1,2]/max(1,s[0,2])
    if uncertain:category=1;reason=8
    elif bed:category=0;reason=0
    elif s[0,1]==0:category=1;reason=1
    elif c[0,1]==0:category=2;reason=2
    elif c[1,0]>0 and c[3,0]>=threshold:category=0;reason=3
    elif c[1,0]>0 and c[3,1]<threshold:category=3;reason=4
    elif c[1,0]==0 and c[2,0]>0:category=1;reason=5
    elif c[3,1]==0:category=1;reason=6
    else:category=1;reason=7
    for y in range(y0,y1+1):
        for x in range(x0,x1+1):
            flags_here=flags[y-y0,x-x0]
            if category==0:
                if flags_here&1:flags_here|=4
                if flags_here&2:flags_here|=8
                if flags_here&16:flags_here|=32
            same[y,x]|=flags_here
    return category,reason,c

REASONS=['BED_CONTACT_ASSUMPTION_NOT_ADHESION_PROOF','SUBGRID_FOOTPRINT','NO_EARLIER_MATERIAL_WITHIN_OUTER_BOUNDS','CONSERVATIVE_GEOMETRIC_COVERAGE_NOT_PHYSICAL_PASS','PARTIAL_ROOTED_RECEIVER','SAME_LAYER_CONTACT_ONLY_NOT_VERTICAL_SUPPORT','ONLY_UNVERIFIED_OR_FLOATING_PREDECESSORS','COVERAGE_BOUND_OR_ROOT_AMBIGUITY','NO_NET_DEPOSITION_DURING_UNRETRACTION']
CATEGORIES=['SUPPORTED_TOOLPATH','UNKNOWN','UNSUPPORTED_FIRST_EXTRUSION','MARGINAL_SUPPORT']
def evaluate(m,previous,same,pitch,threshold,bed):
    cat,reason,c=kernel(previous,same,np.asarray(m['points'],float),m['width'],m.get('approx_error',0.),pitch,threshold,bed,m.get('uncertain_deposition',False))
    result=dict(category=CATEGORIES[cat],reason=REASONS[reason])
    for name,row in zip(('raw_earlier','prior_rooted','same_earlier_rooted','total_rooted'),c):result[name]=dict(zip(('lower','upper','nominal'),map(float,row)))
    result['sensitivity']={str(t):'PASS_COVERAGE' if c[1,0]>0 and c[3,0]>=t else 'NOT_PROVEN' for t in (.25,.5,.75)}
    return result
