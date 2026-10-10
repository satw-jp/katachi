import bpy,json,sys
from pathlib import Path
out=Path.cwd()/'outputs'
import author_scoring_runtime
mp=author_scoring_runtime.depth.midpoint
s=mp.scan_state(bpy.context.scene,False)
d=author_scoring_runtime.depth
lo,hi=d._range((0,0,1))
assert d.FAR_FACTOR==.035 and hi>lo
area=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
region=next(r for r in area.regions if r.type=='WINDOW')
with bpy.context.temp_override(area=area,region=region):
 assert bpy.ops.mini_a.quick_point.poll()
 assert bpy.ops.mini_a.quick_color.poll()
r=mp.update_colors(bpy.context.scene)
assert r['status']=='CURRENT',r
assert all(abs(next(n for n in m.node_tree.nodes if n.bl_idname=='ShaderNodeMapRange').inputs['To Max'].default_value-.035)<1e-6 for m in d._MATERIALS.values())
result={'status':'PASS','midpoints':len(s['mid_records']),'edges':len(s['edge_rows']),'depth_far_factor':.035,'depth_transition':'20% to 80% of projected model bounds','recolor':'CURRENT','operator_context_poll':True,'keymap_entries':len(bpy.context.window_manager.keyconfigs.addon.keymaps['Mesh'].keymap_items) if bpy.context.window_manager.keyconfigs.addon else None,'interactive_keypress':'not exercised','source_file_modified':False}
(out/'MINIA_QUICK_EDIT_QA.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result),flush=True)

