from pathlib import Path
root=Path.cwd();out=root/'outputs';src=out/'view_clip_runtime/view_clip_adapter.py';s=src.read_text(encoding='utf-8')
a=s.index('def _set_planes(');b=s.index('\ndef apply_clips',a)
s=s[:a]+'''def _region_for_q(area,q):
    for region in area.regions:
        if region.type!='WINDOW':continue
        with bpy.context.temp_override(area=area,region=region):
            rd=bpy.context.region_data
            if rd and rd.as_pointer()==q.as_pointer():return region
    raise RuntimeError('3D pane unavailable')


def _set_planes(q,axis,scene):
    # Never set use_clip_planes=True directly: Blender 5.2.2 requires clipbb,
    # allocated and populated only by its native clip_border operator.
    area=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
    region=_region_for_q(area,q)
    interval=_axis_range(scene,axis) if axis is not None else None
    with bpy.context.temp_override(area=area,region=region):
        if q.use_clip_planes:
            bpy.ops.view3d.clip_border('INVOKE_DEFAULT')
        if interval is None:return
        if bpy.app.background:
            scene['view_clip_state']='DEFERRED_TO_VIEWPORT'
            return
        from mathutils import Euler,Quaternion
        old=(q.view_rotation.copy(),q.view_location.copy(),q.view_distance,q.view_perspective)
        try:
            lo,hi=interval
            if hi-lo<1e-6:hi=lo+1e-6
            mins,maxs=_source_bounds(scene)
            center=Vector([(mins[i]+maxs[i])*.5 for i in range(3)])
            center[axis]=(lo+hi)*.5
            # Construct the depth slab from a perpendicular temporary view.
            q.view_rotation=Euler((math.pi/2,0,0)).to_quaternion() if axis==2 else Quaternion((1,0,0,0))
            q.view_location=center;q.view_perspective='ORTHO'
            q.view_distance=max(maxs[i]-mins[i] for i in range(3))*2
            q.update()
            component=0 if axis==0 else 1
            size=region.width if component==0 else region.height
            edge0=max(1,size//4);edge1=size-edge0
            p0=center.copy();p1=center.copy();p0[axis]=lo;p1[axis]=hi
            def project(p):return view3d_utils.location_3d_to_region_2d(region,q,p)
            u,v=project(p0),project(p1)
            q.view_distance*=abs(v[component]-u[component])/(edge1-edge0)
            q.update()
            u,v=project(p0),project(p1)
            if u is None or v is None:raise RuntimeError('Cannot project clip interval')
            low,high=sorted((round(u[component]),round(v[component])))
            if high<=low:raise RuntimeError('Clip interval too narrow')
            # The other screen axis and projection depth cover the model.
            corners=[Vector((x,y,z)) for x in (mins[0],maxs[0]) for y in (mins[1],maxs[1]) for z in (mins[2],maxs[2])]
            side=[project(p)[1-component] for p in corners]
            pad=max(10.,(max(side)-min(side))*.1)
            side0=math.floor(min(side)-pad);side1=math.ceil(max(side)+pad)
            box=dict(xmin=low,xmax=high,ymin=side0,ymax=side1) if component==0 else dict(xmin=side0,xmax=side1,ymin=low,ymax=high)
            result=bpy.ops.view3d.clip_border('EXEC_DEFAULT',**box)
            if 'FINISHED' not in result:raise RuntimeError('Native clipping initialization failed')
            # Native border creates four side planes; discard stale old 6-plane values.
            for i in (4,5):
                for j in range(4):q.clip_planes[i][j]=0.
            scene['view_clip_state']='READY'
        except Exception:
            if q.use_clip_planes:bpy.ops.view3d.clip_border('INVOKE_DEFAULT')
            raise
        finally:
            q.view_rotation,q.view_location,q.view_distance,q.view_perspective=old
            q.update()
            area.tag_redraw()

''' +s[b:]
s=s.replace("space=area.spaces.active;qviews=space.region_quadviews", "space=area.spaces.active;qviews=space.region_quadviews\n    for q in qviews:\n        if q.use_box_clip:q.use_box_clip=False")
s=s.replace("apply_clips(scene)\n    # Range changes", "try:apply_clips(scene)\n    except Exception as exc:\n        scene['view_clip_state']='HOLD';scene['view_clip_error']=str(exc)\n    # Range changes")
s=s.replace("l.label(text='アクソメは全体表示')", "l.label(text='アクソメは全体表示')\n        if s.get('view_clip_state')=='HOLD':l.label(text=s.get('view_clip_error','範囲設定エラー'),icon='ERROR')")
(out/'view_clip_runtime/safe_view_clip_adapter.py').write_text(s,encoding='utf-8')
b=(out/'MINIA_VIEW_CLIP_BOOTSTRAP.py').read_text(encoding='utf-8').replace('import view_clip_adapter as viewclip','import safe_view_clip_adapter as viewclip')
# Clear unsafe saved flags before the old editor activation or any drawing.
b=b.replace("runpy.run_path", "for screen in bpy.data.screens:\n for area in screen.areas:\n  if area.type=='VIEW_3D':\n   for q in area.spaces.active.region_quadviews:q.use_clip_planes=False\nrunpy.run_path",1)
(out/'MINIA_VIEW_CLIP_FIXED_BOOTSTRAP.py').write_text(b,encoding='utf-8')
