import bpy,json,pathlib,hashlib,sys
from mathutils import Vector
O=pathlib.Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs')
scene=bpy.context.scene
target=bpy.data.collections['PERMANENT_EXISTING • global source paths • hidden toggle']
for c in bpy.data.collections:
    c.hide_viewport=c!=target;c.hide_render=True
for o in bpy.data.objects:
    o.select_set(False)
for o in target.objects:
    o.hide_viewport=False;o.hide_set(False);o.show_wire=True
def enable_layer(lc):
    if lc.collection==target:lc.exclude=False;lc.hide_viewport=False
    for child in lc.children:enable_layer(child)
enable_layer(bpy.context.view_layer.layer_collection)
points=[o.matrix_world@v.co for o in target.objects if o.type=='MESH' for v in o.data.vertices]
lo=Vector([min(p[k] for p in points) for k in range(3)]);hi=Vector([max(p[k] for p in points) for k in range(3)])
center=(lo+hi)/2;span=max(hi-lo)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.region_3d.view_location=center
            space.region_3d.view_distance=span*1.8;space.region_3d.view_perspective='ORTHO'
            space.shading.type='WIREFRAME';space.shading.background_type='VIEWPORT';space.shading.background_color=(.7,.72,.75)
            space.overlay.show_floor=False;space.overlay.show_axis_x=False;space.overlay.show_axis_y=False
            space.clip_end=10000
scene['view_purpose']='All 9421 permanent branch centerlines only; no flower or removable Support display; not a global strength evaluation'
scene['route_stale']=True;scene['route_state']='STALE'
scene['route_summary_json']='';scene['route_before_json']='';scene['route_after_json']=''
scene['route_interval_comparison_json']=''
sys.path.insert(0,str(O/'route_runtime'))
import route_v2_panel
audit=route_v2_panel.extract_current_edits(scene)
assert not audit['issues'] and audit['edge_count']==0,audit['issues']
counts={o.name:int(o.get('source_record_count',0)) for o in target.objects}
assert sum(counts.values())==9421,counts
out=O/'MINIA_ALL_BRANCHES_VIEW.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(out))
report={'file':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'branch_count':sum(counts.values()),'groups':counts,'visible_collection':target.name,'bbox_plate_mm':[list(lo),list(hi)],'protected_reference_guard':'PASS','added_edges':0,'manufacturing_geometry_changed':False,'global_strength_evaluation':False}
(O/'MINIA_ALL_BRANCHES_VIEW.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
