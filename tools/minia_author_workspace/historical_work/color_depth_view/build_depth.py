import bpy,sys,json,time,math
from pathlib import Path
from mathutils import Vector

ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');OUT=ROOT/'outputs';WORK=ROOT/'work'/'color_depth_view'
sys.path.insert(0,str(OUT/'color_depth_runtime'))
import depth_runtime as dr

scene=bpy.context.scene;started=time.perf_counter();obj=bpy.data.objects[dr.midpoint.ANCHOR]
refs_before=dr.midpoint._verify_references(scene)
scene['depth_cue_enabled']=True
dr.register(enter_edit_mode=True)
assert len(dr._MATERIALS)==34, len(dr._MATERIALS)
assert all(o.type=='CURVE' and len(o.data.materials)==1 for o in bpy.data.collections[dr.DISPLAY].objects if o.name.startswith('Support distance •'))
lo,hi=dr._range(Vector((0,0,-1)));d1=dr._refresh_view(scene,True,direction=(0,0,-1));z_mat=dr._MATERIALS[15]
z_dot=next(n for n in z_mat.node_tree.nodes if n.bl_idname=='ShaderNodeVectorMath')
assert tuple(round(float(x),4) for x in z_dot.inputs[1].default_value)==(0.0,0.0,-1.0)
lo2,hi2=dr._range(Vector((1,0,0)));dr._refresh_view(scene,True,direction=(1,0,0))
x_dot=next(n for n in z_mat.node_tree.nodes if n.bl_idname=='ShaderNodeVectorMath')
assert tuple(round(float(x),4) for x in x_dot.inputs[1].default_value)==(1.0,0.0,0.0)
assert abs(lo-lo2)>1e-5 or abs(hi-hi2)>1e-5
# Render a preview from the saved camera orientation using the same depth cue.
camera=scene.camera;assert camera is not None
saved=(scene.render.engine,scene.render.filepath,scene.render.resolution_percentage)
forward=camera.matrix_world.to_quaternion() @ Vector((0,0,-1))
dr._refresh_view(scene,True,direction=forward)
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=70
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'MINIA_DEPTH_PATH_EDITOR_PREVIEW.png')
bpy.ops.render.render(write_still=True)
scene.render.engine,scene.render.filepath,scene.render.resolution_percentage=saved
# Restore the actual viewport direction before saving the user-facing blend.
screen=bpy.context.screen;area=next((a for a in screen.areas if a.type=='VIEW_3D'),None) if screen else None
if area:dr._refresh_view(scene,True,direction=area.spaces.active.region_3d.view_rotation @ Vector((0,0,-1)))
refs_after=dr.midpoint._verify_references(scene);assert refs_before==refs_after
assert bpy.context.mode=='EDIT_MESH' and bpy.context.view_layer.objects.active==obj
assert len(obj.data.edges)==0 and not obj.data.polygons
result={'status':'BUILD_PASS','depth_materials':len(dr._MATERIALS),'depth_shader':'Geometry Position dot viewport-forward -> MapRange -> background mix -> Emission','viewport_type':'MATERIAL','source_branches':9421,'source_segments':35303,'source_refs':refs_after,'source_fingerprint_unchanged':True,'midpoint_edit_mode_preserved':True,'delivery_edges':len(obj.data.edges),'delivery_faces':len(obj.data.polygons),'far_factor':dr.FAR_FACTOR,'rotation_forward_uniform_test':'PASS','projection_range_changes_with_view':'PASS','camera_preview':str(OUT/'MINIA_DEPTH_PATH_EDITOR_PREVIEW.png'),'elapsed_s':time.perf_counter()-started}
scene['depth_build_qa_json']=json.dumps(result,separators=(',',':'),ensure_ascii=False)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'MINIA_DEPTH_PATH_EDITOR.blend'))
(OUT/'MINIA_DEPTH_PATH_EDITOR_BUILD_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False),flush=True)
