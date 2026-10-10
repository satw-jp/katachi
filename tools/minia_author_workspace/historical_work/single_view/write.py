from pathlib import Path
out=Path('outputs');s=(out/'view_clip_runtime/shared_view_clip_adapter.py').read_text(encoding='utf-8-sig')
s=s.replace('space=area.spaces.active;qviews=space.region_quadviews', 'space=area.spaces.active;qviews=list(space.region_quadviews)\n    if not qviews:qviews=[space.region_3d]')
s=s.replace('if len(qviews)!=4:return 0','if len(qviews) not in (1,4):return 0')
s=s.replace('for cls in (MINIA_OT_ortho_pan,MINIA_OT_apply_ranges):','for cls in (MINIA_OT_ortho_pan,MINIA_OT_apply_ranges,MINIA_OT_toggle_single):')
pos=s.index('def _lock_orthographic_views')
s=s[:pos]+'''def _view_state(q):
    return dict(rotation=list(q.view_rotation),location=list(q.view_location),distance=q.view_distance,perspective=q.view_perspective,locked=q.lock_rotation)

def _restore_view(q,state):
    q.view_rotation=state['rotation'];q.view_location=state['location'];q.view_distance=state['distance'];q.view_perspective=state['perspective'];q.lock_rotation=state['locked']

class MINIA_OT_toggle_single(bpy.types.Operator):
    bl_idname='mini_a.toggle_single';bl_label='1画面 / 4画面 切替'
    @classmethod
    def poll(cls,c):return c.area is not None and c.area.type=='VIEW_3D'
    def execute(self,c):
        area=c.area;space=area.spaces.active;scene=c.scene;qs=list(space.region_quadviews)
        if len(qs)==4:
            saved=[_view_state(q) for q in qs]
            scene['minia_saved_quad_views']=json.dumps(saved)
            for q in qs:
                r=_region_for_q(area,q)
                with bpy.context.temp_override(area=area,region=r):_clear_native_clip(q)
            region=_region_for_q(area,qs[3])
            with bpy.context.temp_override(area=area,region=region):bpy.ops.screen.region_quadview()
            _restore_view(space.region_3d,saved[3]);scene['minia_single_view']=True
        else:
            saved=json.loads(scene.get('minia_saved_quad_views','[]'))
            if len(saved)!=4:
                self.report({'ERROR'},'戻す4画面の情報がありません');return {'CANCELLED'}
            region=_region_for_q(area,space.region_3d)
            with bpy.context.temp_override(area=area,region=region):
                _clear_native_clip(space.region_3d);bpy.ops.screen.region_quadview()
            for q,state in zip(space.region_quadviews,saved):_restore_view(q,state)
            scene['minia_single_view']=False
        apply_clips(scene);area.tag_redraw()
        return {'FINISHED'}

''' +s[pos:]
s=s.replace("s=context.scene;l=self.layout\n", "s=context.scene;l=self.layout\n        single=not bool(context.space_data.region_quadviews)\n        l.operator('mini_a.toggle_single',text='4画面に戻す' if single else 'アクソメを1画面にする')\n")
(out/'view_clip_runtime/single_view_clip_adapter.py').write_text(s,encoding='utf-8')
b=(out/'MINIA_SHARED_CLIP_BOOTSTRAP.py').read_text(encoding='utf-8-sig').replace('import shared_view_clip_adapter as viewclip','import single_view_clip_adapter as viewclip')
b=b.replace("for q in area.spaces.active.region_quadviews:q.use_clip_planes=False", "for q in (list(area.spaces.active.region_quadviews) or [area.spaces.active.region_3d]):q.use_clip_planes=False")
needle="runpy.run_path(str(OUT/'MINIA_QUAD_EDITOR_BOOTSTRAP.py'))"
replace='''# Existing saved views must survive activation and reopening, including single mode.
import quad_view_adapter as quad
_original_configure=quad.configure
def _preserve_configure():
 area=next((a for a in bpy.context.screen.areas if a.type=='VIEW_3D'),None)
 if area and (len(area.spaces.active.region_quadviews)==4 or bpy.context.scene.get('minia_single_view',False)):
  return {'preserved_saved_views':True,'single':bool(bpy.context.scene.get('minia_single_view',False))}
 return _original_configure()
quad.configure=_preserve_configure
'''+needle
b=b.replace(needle,replace)
(out/'MINIA_SINGLE_VIEW_BOOTSTRAP.py').write_text(b,encoding='utf-8')
