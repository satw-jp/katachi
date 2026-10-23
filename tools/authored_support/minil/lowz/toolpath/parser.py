"""Streaming millimetre G-code reader with explicit extrusion and arc semantics."""
import math,re
WORDS=re.compile(r'([XYZEFIJKR])([-+]?(?:\d*\.\d+|\d+\.?\d*))')

def arc_points(a,b,v,clockwise,absolute_center=False,sag=.002):
    if 'R' in v:
        r=abs(v['R']);dx=b[0]-a[0];dy=b[1]-a[1];ch=math.hypot(dx,dy)
        if not ch or ch>2*r+1e-9:raise ValueError('INVALID_RADIUS_ARC')
        h=math.sqrt(max(0,r*r-ch*ch/4));centres=[((a[0]+b[0])/2+s*(-dy/ch)*h,(a[1]+b[1])/2+s*(dx/ch)*h) for s in (-1,1)]
        candidates=[]
        for cx,cy in centres:
            t0=math.atan2(a[1]-cy,a[0]-cx);t1=math.atan2(b[1]-cy,b[0]-cx);sw=((t0-t1) if clockwise else (t1-t0))%(2*math.pi)
            if (sw<=math.pi+1e-9)==(v['R']>=0):candidates.append((cx,cy,sw))
        if not candidates:raise ValueError('R_ARC_AMBIGUOUS')
        cx,cy,sw=candidates[0]
    else:
        if not ('I' in v or 'J' in v):raise ValueError('ARC_CENTER_UNBOUND')
        cx=v.get('I',a[0]) if absolute_center else a[0]+v.get('I',0)
        cy=v.get('J',a[1]) if absolute_center else a[1]+v.get('J',0)
        r=math.hypot(a[0]-cx,a[1]-cy);t0=math.atan2(a[1]-cy,a[0]-cx);t1=math.atan2(b[1]-cy,b[0]-cx)
        sw=((t0-t1) if clockwise else (t1-t0))%(2*math.pi)
        if sw<1e-12:sw=2*math.pi
    if r<=0:raise ValueError('ZERO_RADIUS')
    dr=abs(math.hypot(b[0]-cx,b[1]-cy)-r)
    if dr>.02:raise ValueError('ARC_RADIUS_MISMATCH')
    step=2*math.acos(max(-1,min(1,1-sag/r)));n=max(2,math.ceil(sw/max(step,1e-6)))
    t0=math.atan2(a[1]-cy,a[0]-cx);sign=-1 if clockwise else 1
    p=[(cx+r*math.cos(t0+sign*sw*i/n),cy+r*math.sin(t0+sign*sw*i/n)) for i in range(n+1)];p[0]=a[:2];p[-1]=b[:2]
    return p,r*sw,sag+dr,dict(center=[cx,cy],radius=r,sweep=sign*sw)

def raw_motions(lines,max_z=50.4):
    xyz=[0.,0.,0.];e=0.;absxyz=True;abse=True;abscenter=False;plane='G17'
    layer=0;z=None;height=None;width=None;feature='';uid=0;active=False;debt=0.;feed=None;units=True
    for line_number,text in enumerate(lines,1):
        line=text.strip()
        if line=='; CHANGE_LAYER':active=False
        if line.startswith('; layer num/total_layer_count:'):
            layer=int(line.split(':')[1].split('/')[0]);active=False
        elif line.startswith('; Z_HEIGHT:'):
            z=float(line.split(':')[1])
            if z>max_z+1e-8:return
        elif line.startswith('; LAYER_HEIGHT:'):height=float(line.split(':')[1])
        elif line.startswith('; LINE_WIDTH:'):width=float(line.split(':')[1])
        elif line.startswith('; FEATURE:'):feature=line.split(':',1)[1].strip()
        code=line.split(';')[0].strip()
        if not code:continue
        op=code.split()[0];v={k:float(x) for k,x in WORDS.findall(code[len(op):])}
        if op=='M83':abse=False
        elif op=='M82':abse=True
        elif op=='G90':absxyz=True
        elif op=='G91':absxyz=False
        elif op=='G90.1':abscenter=True
        elif op=='G91.1':abscenter=False
        elif op in ('G17','G18','G19'):plane=op
        elif op=='G20':units=False
        elif op=='G21':units=True
        elif op=='G92':
            for i,k in enumerate('XYZ'):xyz[i]=v.get(k,xyz[i])
            e=v.get('E',e)
        elif op in ('G0','G1','G2','G3'):
            a=xyz[:];b=[v.get(k,xyz[i]) if absxyz else xyz[i]+v.get(k,0) for i,k in enumerate('XYZ')]
            de=v.get('E',e)-e if abse else v.get('E',0)
            if 'E' in v:e=v['E'] if abse else e+v['E']
            xyz=b;feed=v.get('F',feed);moving=math.dist(a[:2],b[:2])>1e-10 or op in ('G2','G3')
            olddebt=debt;debt=max(0,debt-de)
            if de<=0 or not moving or not layer or feature in ('Custom','Undefined',''):
                if moving or de<0:active=False
                continue
            if not active:uid+=1;active=True;first=True
            else:first=False
            errors=[]
            if not units:errors.append('INCH_UNITS')
            if plane!='G17' and op in ('G2','G3'):errors.append('NON_XY_ARC')
            if width is None or width<=0 or height is None or height<=0:errors.append('DIMENSIONS_UNBOUND')
            if z is None or abs(b[2]-z)>.002 or abs(a[2]-b[2])>.002:errors.append('NONPLANAR_OR_LAYER_Z_MISMATCH')
            points=[a[:2],b[:2]];length=math.dist(a[:2],b[:2]);error=0.;arc=None
            if op in ('G2','G3'):
                try:points,length,error,arc=arc_points(a,b,v,op=='G2',abscenter)
                except ValueError as ex:errors.append(str(ex))
            # Do not erase a rounded residual retract debt by relaxing epsilon.
            # Bound the potentially unfilled prefix under uniform E/arc length;
            # add its Hausdorff displacement to the inner/outer sweep error.
            debt_length=length*min(1.,olddebt/de)
            if olddebt>=de:errors.append('NO_NET_DEPOSITION_DURING_UNRETRACTION')
            error+=debt_length
            yield dict(line=line_number,uid=uid,first_in_path=first,layer=layer,z=z,height=height,width=width,
                       feature=feature,points=points,length=length,e_delta=de,net_e=max(0,de-olddebt),
                       feed=feed,arc=arc,approx_error=error,errors=errors,raw=code,physical_z=b[2],retract_prefix_bound_mm=debt_length,uncertain_deposition=olddebt>=de)

def subdivide(m,max_span=2.):
    """Ordered analytical spans of one command, not new G-code commands."""
    p=m['points'];pieces=[];piece=[p[0]];used=0.;total=sum(math.dist(a,b) for a,b in zip(p,p[1:]));lengths=[]
    if total<=max_span:
        yield dict(m,span_index=0,span_count=1);return
    for target in p[1:]:
        a=piece[-1];dist=math.dist(a,target)
        while used+dist>max_span+1e-10:
            step=max_span-used;t=step/dist;b=[a[i]+(target[i]-a[i])*t for i in (0,1)]
            piece.append(b);pieces.append(piece);lengths.append(max_span);piece=[b];used=0.;a=b;dist=math.dist(a,target)
        piece.append(target);used+=dist
    if used>1e-10:pieces.append(piece);lengths.append(used)
    for i,(points,length) in enumerate(zip(pieces,lengths)):
        yield dict(m,points=points,length=m['length']*length/total,e_delta=m['e_delta']*length/total,net_e=m['net_e']*length/total,
                   span_index=i,span_count=len(pieces),first_in_path=m['first_in_path'] and i==0)

def motions(lines,max_z=50.4):
    for m in raw_motions(lines,max_z):yield from subdivide(m)
