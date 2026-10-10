import bpy,ast,hashlib,struct,math,json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';blend=out/'MINIA_SUPPORT_DISTANCE_COLORS.blend';preview=out/'MINIA_SUPPORT_DISTANCE_COLORS_PREVIEW.png';score=json.loads((out/'SUPPORT_DISTANCE_COLORS.json').read_text(encoding='utf-8-sig'))
scene=bpy.context.scene;cam=scene.camera;obj=bpy.data.objects['DISPLAY_ONLY • support distance legend'];
bpy.context.view_layer.update()
frame=cam.data.view_frame(scene=scene);x0=min(v.x for v in frame);y1=max(v.y for v in frame);z=-30.0
obj.data.body='FINISHED GEOMETRY - SUPPORT INCLUDED\nGREEN = NEAR SUPPORT    RED = FAR    GRAY = NO MAPPED ROUTE\nASSUMPTION-BASED COLOR MAP - NOT SAFETY OR STRENGTH'
obj.data.size=2.4
obj.location=cam.matrix_world@Vector((x0+16.0,y1-18.0,z));obj.rotation_euler=cam.rotation_euler
bpy.context.view_layer.update();coord=world_to_camera_view(scene,cam,obj.matrix_world.translation)
if not (0.01<coord.x<0.1 and 0.86<coord.y<0.98):raise RuntimeError(f'Legend origin is outside planned frame: {(coord.x,coord.y,coord.z)}')
text=bpy.data.texts['SUPPORT_DISTANCE_COLOR_RULE • display-only'];text.clear();text.write('Finished geometry with external Support assumed present. Colors are an assumption-based distance heuristic: green near a declared support region, red farther along a Permanent branch, gray only where the scoring ledger has no mapped route. Gray does not establish physical danger or prove absence of every real contact. The 35% merge bonus applies only to paths joining distinct declared support-contact regions; shared tails do not receive it. Not live printer status, safety certification, strength prediction, complete physical contact evaluation, or toolpath analysis.')
scene['support_distance_gray_semantics']='NO_MAPPED_ROUTE_IN_SCORING_LEDGER; NOT PROVEN_PHYSICALLY_UNSUPPORTED_OR_DANGEROUS';scene['support_source_support_sha256']=score.get('source_support_sha256','');scene['support_source_flower_sha256']=score.get('source_flower_sha256','');scene['support_finished_geometry_with_support_assumed']=True
scene.render.filepath=str(preview)
bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.render.render(write_still=True)
print(json.dumps({'legend_screen_xy':[coord.x,coord.y],'legend_projected_bbox':bbox,'legend_body':obj.data.body,'blend':str(blend),'preview':str(preview)},indent=2,ensure_ascii=False),flush=True)

