from pathlib import Path
out=Path('outputs');s=(out/'view_clip_runtime/stable_view_clip_adapter.py').read_text(encoding='utf-8-sig')
s=s.replace("axis=_axis_for_region(q);_set_planes(q,axis,scene)","axis=int(scene.minia_clip_shared_axis) if scene.minia_clip_shared else _axis_for_region(q);_set_planes(q,axis,scene)")
s=s.replace("scene['view_clip_applied_json']=json.dumps", "scene['view_clip_applied_shared']=bool(scene.minia_clip_shared)\n    scene['view_clip_applied_axis']=int(scene.minia_clip_shared_axis)\n    scene['view_clip_applied_json']=json.dumps")
s=s.replace("def _region_axis_range(rd,scene):\n    axis=_axis_for_region(rd)","def _region_axis_range(rd,scene):\n    axis=int(scene.get('view_clip_applied_axis',2)) if scene.get('view_clip_applied_shared',False) else _axis_for_region(rd)")
s=s.replace("    _REGISTERED=True\n    return True", "    if not hasattr(bpy.types.Scene,'minia_clip_shared'):\n        bpy.types.Scene.minia_clip_shared=bpy.props.BoolProperty(name='全ビュー共通',default=False,update=_range_update)\n        bpy.types.Scene.minia_clip_shared_axis=bpy.props.EnumProperty(name='共通にする軸',items=[('2','Z','Zの範囲を4画面に適用'),('1','Y','Yの範囲を4画面に適用'),('0','X','Xの範囲を4画面に適用')],default='2',update=_range_update)\n    _REGISTERED=True\n    return True")
s=s.replace("s=context.scene;l=self.layout;l.label(text='各軸の最小0% → 最大100%')", "s=context.scene;l=self.layout\n        l.prop(s,'minia_clip_shared')\n        if s.minia_clip_shared:l.prop(s,'minia_clip_shared_axis',expand=True)\n        l.label(text='各軸の最小0% → 最大100%')")
s=s.replace("row=l.row(align=True);row.label(text=label);", "row=l.row(align=True)\n            row.enabled=not s.minia_clip_shared or a=='minia_clip_'+{'2':'z','1':'y','0':'x'}[s.minia_clip_shared_axis]+'_start'\n            row.label(text=label);")
s=s.replace("l.label(text='アクソメは全体表示')", "l.label(text='4画面に同じ範囲を表示' if s.minia_clip_shared else 'アクソメは全体表示')")
(out/'view_clip_runtime/shared_view_clip_adapter.py').write_text(s,encoding='utf-8')
s=(out/'MINIA_VIEW_CLIP_CONTROLS_BOOTSTRAP.py').read_text(encoding='utf-8-sig').replace('import stable_view_clip_adapter as viewclip','import shared_view_clip_adapter as viewclip')
(out/'MINIA_SHARED_CLIP_BOOTSTRAP.py').write_text(s,encoding='utf-8')
s=Path('work/clip_controls/build.py').read_text(encoding='utf-8-sig').replace('MINIA_VIEW_CLIP_CONTROLS_BOOTSTRAP.py','MINIA_SHARED_CLIP_BOOTSTRAP.py').replace('import stable_view_clip_adapter as vc','import shared_view_clip_adapter as vc').replace('MINIA_QUAD_CLIP_CONTROLS_FIXED.blend','MINIA_QUAD_SHARED_CLIP.blend').replace('MINIA_CLIP_CONTROLS_QA.json','MINIA_SHARED_CLIP_QA.json')
pos=s.index("bpy.ops.wm.save_as_mainfile")
s=s[:pos]+'''# Verify common Z 0..15 maps every region, including axo, to the same slab.
s.minia_clip_shared=True;s.minia_clip_shared_axis='2';s.minia_clip_z_end=15.
bpy.ops.mini_a.apply_view_ranges()
expected=vc._axis_range(s,2)
assert all(vc._region_axis_range(q,s)==(2,tuple(expected)) for q in qs)
s.minia_clip_shared=False;bpy.ops.mini_a.apply_view_ranges()
assert vc._region_axis_range(qs[3],s)==(None,None)
assert [vc._region_axis_range(q,s)[0] for q in qs]==[2,1,0,None]
# Open initially in common mode, with full range, ready for user input.
s.minia_clip_shared=True;s.minia_clip_z_end=100.;bpy.ops.mini_a.apply_view_ranges();s['view_clip_state']='READY'
assert snap()==before
''' +s[pos:]
s=s.replace("'status':'PASS'", "'status':'PASS','common_z_0_15_four_panes':True,'individual_mode_restored':True")
Path('work/shared_clip/build.py').write_text(s,encoding='utf-8')
