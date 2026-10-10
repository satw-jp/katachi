from pathlib import Path
p=Path('outputs/view_clip_runtime/single_view_clip_adapter.py');s=p.read_text(encoding='utf-8')
s=s.replace('from mathutils import Vector','from mathutils import Vector,Euler,Matrix')
pos=s.index('def _axis_range(')
s=s[:pos]+'''_PROJECTED_BOUNDS={}
def _clip_direction(scene,axis):
    n=Vector(tuple(1. if i==axis else 0. for i in range(3)))
    if scene.minia_clip_shared and scene.minia_clip_tilt:
        angles=[math.radians(getattr(scene,'minia_clip_tilt_'+a)) for a in 'xyz']
        n=Euler(angles,'XYZ').to_matrix()@n
    return n.normalized()

def _projection_bounds(scene,axis):
    n=_clip_direction(scene,axis);key=tuple(round(v,10) for v in n)
    if key not in _PROJECTED_BOUNDS:
        cache,_,_,_=mp._read_data(scene)
        values=[n.dot(Vector(p)) for seg in cache['segments'] for p in (seg['a'],seg['b'])]
        _PROJECTED_BOUNDS.clear();_PROJECTED_BOUNDS[key]=(min(values),max(values))
    return _PROJECTED_BOUNDS[key]

def _applied_direction(scene,axis):
    if axis is None:return None
    values=json.loads(scene.get('view_clip_applied_directions','{}'))
    return Vector(values.get(str(axis),tuple(1. if i==axis else 0. for i in range(3))))

''' +s[pos:]
s=s.replace("mins,maxs=_source_bounds(scene);return mins[axis]+(maxs[axis]-mins[axis])*lo/100.,mins[axis]+(maxs[axis]-mins[axis])*hi/100.","lower,upper=_projection_bounds(scene,axis);return lower+(upper-lower)*lo/100.,lower+(upper-lower)*hi/100.")
s=s.replace('def _line_clip(a,b,axis,low,high):','def _line_clip(a,b,axis,low,high,direction=None):')
s=s.replace('av=float(a[axis]);bv=float(b[axis]);d=bv-av','av=Vector(a).dot(direction) if direction is not None else float(a[axis]);bv=Vector(b).dot(direction) if direction is not None else float(b[axis]);d=bv-av')
s=s.replace("center[axis]=(lo+hi)*.5", "normal=_clip_direction(scene,axis)\n            center+=normal*((lo+hi)*.5-center.dot(normal))")
s=s.replace("q.view_rotation=Euler((math.pi/2,0,0)).to_quaternion() if axis==2 else Quaternion((1,0,0,0))", "helper=Vector((0,0,1)) if abs(normal.z)<.9 else Vector((0,1,0))\n            up=(helper-normal*helper.dot(normal)).normalized()\n            look=normal.cross(up).normalized()\n            q.view_rotation=Matrix((normal,up,look)).transposed().to_quaternion()")
s=s.replace('component=0 if axis==0 else 1','component=0')
s=s.replace('p0=center.copy();p1=center.copy();p0[axis]=lo;p1[axis]=hi','p0=center+normal*(lo-(lo+hi)*.5);p1=center+normal*(hi-(lo+hi)*.5)')
s=s.replace("scene['view_clip_applied_json']=json.dumps", "scene['view_clip_applied_directions']=json.dumps({str(i):list(_clip_direction(scene,i)) for i in range(3)})\n    scene['view_clip_applied_json']=json.dumps")
s=s.replace("clipped=_line_clip(av,bv,axis,*interval)", "clipped=_line_clip(av,bv,axis,*interval,direction=_applied_direction(bpy.context.scene,axis))")
s=s.replace("interval[0]-1e-6<=p[1][axis]<=interval[1]+1e-6", "interval[0]-1e-6<=Vector(p[1]).dot(_applied_direction(context.scene,axis))<=interval[1]+1e-6")
s=s.replace("    _REGISTERED=True\n    return True", "    if not hasattr(bpy.types.Scene,'minia_clip_tilt'):\n        bpy.types.Scene.minia_clip_tilt=bpy.props.BoolProperty(name='クリップ面を傾ける',default=False,update=_range_update)\n        for axis in 'xyz':\n            setattr(bpy.types.Scene,'minia_clip_tilt_'+axis,bpy.props.FloatProperty(name=axis.upper()+'回転 (度)',default=0.,min=-180.,max=180.,precision=1,update=_range_update))\n    _REGISTERED=True\n    return True")
s=s.replace("if s.minia_clip_shared:l.prop(s,'minia_clip_shared_axis',expand=True)", "if s.minia_clip_shared:\n            l.prop(s,'minia_clip_shared_axis',expand=True)\n            l.prop(s,'minia_clip_tilt')\n            if s.minia_clip_tilt:\n                for axis in 'xyz':l.prop(s,'minia_clip_tilt_'+axis)\n                l.label(text='傾けた方向の最小0% → 最大100%')")
p.write_text(s,encoding='utf-8')
