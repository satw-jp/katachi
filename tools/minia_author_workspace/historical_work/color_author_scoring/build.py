import bpy,sys,json,time
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');OUT=ROOT/'outputs';WORK=ROOT/'work'/'color_author_scoring'
sys.path.insert(0,str(OUT/'color_author_runtime'))
import author_scoring_runtime as ar
dr=ar.depth;mp=ar.midpoint;scene=bpy.context.scene;started=time.perf_counter();anchor=bpy.data.objects[mp.ANCHOR]
refs_before=mp._verify_references(scene)
scene['depth_cue_enabled']=True
ar.register(enter_edit_mode=True)
state=mp.scan_state(scene,True)
assert not state['edge_rows'] and not state['mid_records'] and not state['roots'] and not state['bm'].faces
assert len(dr._MATERIALS)==33
curves=[o for o in bpy.data.collections[mp.DISPLAY].objects if o.type=='CURVE' and o.name.startswith('Support distance •')]
assert len(curves)==32 and all(len(o.data.materials)==1 and o.data.materials[0].name.startswith('MINI_A depth color') for o in curves)
assert bpy.context.mode=='EDIT_MESH' and bpy.context.view_layer.objects.active==anchor
camera=scene.camera;assert camera is not None
saved=(scene.render.engine,scene.render.filepath,scene.render.resolution_percentage)
forward=camera.matrix_world.to_quaternion()@Vector((0,0,-1));dr._refresh_view(scene,True,direction=forward)
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=70
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'MINIA_ALL_LINES_RISK_EDITOR_PREVIEW.png');bpy.ops.render.render(write_still=True)
scene.render.engine,scene.render.filepath,scene.render.resolution_percentage=saved
screen=bpy.context.screen;area=next((a for a in screen.areas if a.type=='VIEW_3D'),None) if screen else None
if area:dr._refresh_view(scene,True,direction=area.spaces.active.region_3d.view_rotation@Vector((0,0,-1)))
assert mp._verify_references(scene)==refs_before
result={'status':'BUILD_PASS','source_branches':9421,'source_segments':35303,'source_refs':refs_before,'delivery_midpoints':0,'delivery_author_edges':0,'depth_materials':len(dr._MATERIALS),'source_curve_material_bins':len(curves),'protected_source_unchanged':True,'manufacturing_geometry_changed':False,'midpoint_edit_mode_preserved':True,'author_preview_collection_empty':not bool(bpy.data.collections.get(mp.PREVIEW) and bpy.data.collections[mp.PREVIEW].objects),'preview':str(OUT/'MINIA_ALL_LINES_RISK_EDITOR_PREVIEW.png'),'elapsed_s':time.perf_counter()-started}
scene['all_lines_build_qa_json']=json.dumps(result,separators=(',',':'),ensure_ascii=False)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'MINIA_ALL_LINES_RISK_EDITOR.blend'))
(OUT/'MINIA_ALL_LINES_RISK_EDITOR_BUILD_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True)
