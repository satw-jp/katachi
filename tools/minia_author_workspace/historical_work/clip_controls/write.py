from pathlib import Path
p=Path('outputs/view_clip_runtime/safe_view_clip_adapter.py');s=p.read_text(encoding='utf-8-sig')
a=s.index('def _axis_for_region');b=s.index('\ndef _pct',a)
s=s[:a]+'''def _axis_for_region(rd):
    screen=bpy.context.screen
    if screen:
        for area in screen.areas:
            if area.type!='VIEW_3D':continue
            qs=area.spaces.active.region_quadviews
            if len(qs)!=4:continue
            for i,q in enumerate(qs):
                if rd.as_pointer()==q.as_pointer():return (2,1,0,None)[i]
    return None

''' +s[b:]
a=s.index('def _range_update');b=s.index('\ndef _region_axis_range',a)
s=s[:a]+'''def _range_update(_self,_context):
    # Do not invoke viewport operators inside RNA numeric-drag callbacks.
    _self['view_clip_state']='PENDING'

class MINIA_OT_apply_ranges(bpy.types.Operator):
    bl_idname='mini_a.apply_view_ranges';bl_label='表示範囲を反映'
    def execute(self,context):
        try:
            apply_clips(context.scene);_deselect_anchor()
            context.scene['view_clip_state']='READY' if not bpy.app.background else 'DEFERRED_TO_VIEWPORT'
        except Exception as exc:
            context.scene['view_clip_state']='HOLD';context.scene['view_clip_error']=str(exc)
            self.report({'ERROR'},str(exc));return {'CANCELLED'}
        return {'FINISHED'}

class MINIA_OT_ortho_pan(bpy.types.Operator):
    bl_idname='mini_a.ortho_pan';bl_label='平行ビューをパン'
    @classmethod
    def poll(cls,c):
        return c.area is not None and c.area.type=='VIEW_3D' and c.region_data is not None and _axis_for_region(c.region_data) is not None
    def invoke(self,c,e):
        return bpy.ops.view3d.move('INVOKE_DEFAULT')

def _lock_orthographic_views():
    from mathutils import Quaternion,Euler
    rotations=(Quaternion((1,0,0,0)),Euler((math.pi/2,0,0)).to_quaternion(),Euler((math.pi/2,0,math.pi/2)).to_quaternion())
    for a in bpy.context.screen.areas:
        if a.type!='VIEW_3D':continue
        qs=a.spaces.active.region_quadviews
        if len(qs)!=4:continue
        for q,rot in zip(qs,rotations):
            q.view_rotation=rot;q.view_perspective='ORTHO';q.lock_rotation=True
    for cls in (MINIA_OT_ortho_pan,MINIA_OT_apply_ranges):
        if not hasattr(bpy.types,cls.__name__):bpy.utils.register_class(cls)
    kc=bpy.context.window_manager.keyconfigs.addon
    if kc:
        km=kc.keymaps.get('3D View') or kc.keymaps.new(name='3D View',space_type='VIEW_3D')
        if not any(k.idname=='mini_a.ortho_pan' for k in km.keymap_items):km.keymap_items.new('mini_a.ortho_pan','MIDDLEMOUSE','PRESS',head=True)

''' +s[b:]
s=s.replace("l.label(text='範囲変更時は選択を解除します')", "l.operator('mini_a.apply_view_ranges',text='表示範囲を反映')\n        l.label(text='数値入力後に反映を押してください')\n        l.label(text='反映時は選択を解除します')")
s=s.replace("    apply_clips(scene)\n    _solid_material_view()", "    _lock_orthographic_views()\n    _solid_material_view()\n    apply_clips(scene)")
# Picking/markers use the applied ranges, not pending typed values.
s=s.replace("def _region_axis_range(rd,scene):\n    axis=_axis_for_region(rd)\n    return axis,_axis_range(scene,axis) if axis is not None else None", "def _region_axis_range(rd,scene):\n    axis=_axis_for_region(rd)\n    applied=json.loads(scene.get('view_clip_applied_json','{}'))\n    value=applied.get(str(axis))\n    return axis,tuple(value) if value is not None else None")
s=s.replace("scene['quad_clip_regions_json']=json.dumps(mapping,separators=(',',':'))", "scene['quad_clip_regions_json']=json.dumps(mapping,separators=(',',':'))\n    scene['view_clip_applied_json']=json.dumps({str(i):_axis_range(scene,i) for i in range(3)})")
Path('outputs/view_clip_runtime/stable_view_clip_adapter.py').write_text(s,encoding='utf-8')
p=Path('outputs/MINIA_VIEW_CLIP_FIXED_BOOTSTRAP.py');s=p.read_text(encoding='utf-8-sig').replace('import safe_view_clip_adapter as viewclip','import stable_view_clip_adapter as viewclip');Path('outputs/MINIA_VIEW_CLIP_CONTROLS_BOOTSTRAP.py').write_text(s,encoding='utf-8')
