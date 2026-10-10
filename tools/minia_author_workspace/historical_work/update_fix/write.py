from pathlib import Path
out=Path('outputs');s=(out/'view_clip_runtime/deferred_points_runtime.py').read_text(encoding='utf-8-sig')
a=s.index('def update_colors(');b=s.index('class MINIA_PT_auto_points',a)
s=s[:a]+'''def update_colors(scene=None):
    scene=scene or bpy.context.scene
    try:
        subdivide(scene,True)
        result=_BASE_UPDATE(scene)
    except Exception as exc:result={'status':'HOLD','issues':[str(exc)]}
    if result.get('status')!='CURRENT':
        scene['midpoint_editor_state']='HOLD'
        scene['midpoint_editor_reason']=' / '.join(str(x) for x in result.get('issues',[]))
        # Keep HOLD visible until the geometry changes; the old polling loop uses this signature.
        scene['midpoint_anchor_signature']=mp._signature()
    return result

class MINIA_OT_connect_two_points(bpy.types.Operator):
    bl_idname='mini_a.connect_two_points';bl_label='2点を仮線で接続';bl_options={'REGISTER','UNDO'}
    @classmethod
    def poll(cls,c):return c.mode=='EDIT_MESH' and c.active_object is not None and c.active_object.name==mp.ANCHOR
    def execute(self,c):
        bm=bmesh.from_edit_mesh(c.active_object.data)
        if sum(v.select for v in bm.verts)!=2:
            self.report({'WARNING'},'接続する点を2つだけ選んでください。面は作成しません。')
            return {'CANCELLED'}
        result=bpy.ops.mesh.edge_face_add()
        c.scene['midpoint_editor_state']='STALE';c.scene['midpoint_editor_reason']='仮線を追加しました。色を更新してください。'
        return result

''' +s[b:]
s=s.replace('for cls in (MINIA_PT_auto_points,):','for cls in (MINIA_PT_auto_points,MINIA_OT_connect_two_points):')
s+= "\n        if not any(k.idname=='mini_a.connect_two_points' for k in km.keymap_items):km.keymap_items.new('mini_a.connect_two_points','F','PRESS',head=True)\n"
s=s.replace("text='F：仮の線を接続（点は増やさない）'", "text='F：2点を仮線で接続（面は作らない）'")
(out/'view_clip_runtime/guarded_points_runtime.py').write_text(s,encoding='utf-8')
s=(out/'MINIA_DEFERRED_POINTS_BOOTSTRAP.py').read_text(encoding='utf-8-sig').replace('import deferred_points_runtime as auto','import guarded_points_runtime as auto')
(out/'MINIA_COLOR_UPDATE_FIXED_BOOTSTRAP.py').write_text(s,encoding='utf-8')
