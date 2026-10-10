import bpy,sys,json,hashlib
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');sys.path.insert(0,str(root/'outputs'/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;obj=bpy.data.objects.get(mp.ANCHOR);scene=bpy.context.scene
r={'filepath':bpy.data.filepath,'sha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'mesh':{'verts':len(obj.data.vertices),'edges':len(obj.data.edges),'faces':len(obj.data.polygons),'mode':obj.mode},'refs':len([o for o in bpy.data.objects if o.get('source_reference')]),'viewport':[],'materials':[],'collections':[]}
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   s=area.spaces.active;r['viewport'].append({'shade':s.shading.type,'color_type':s.shading.color_type,'light':s.shading.light,'background':s.shading.background_type,'clip_start':s.region_3d.view_perspective if s.region_3d else None,'overlay':s.overlay.show_overlays,'wireframe':s.overlay.show_wireframes,'floor':s.overlay.show_floor,'axis_x':s.overlay.show_axis_x,'axis_y':s.overlay.show_axis_y,'clip_near':s.clip_start,'clip_far':s.clip_end})
for m in bpy.data.materials:
 if m.name.startswith('MINI_A depth color'):
  nodes=list(m.node_tree.nodes);mpn=next((n for n in nodes if n.bl_idname=='ShaderNodeMapRange'),None);mix=next((n for n in nodes if n.bl_idname=='ShaderNodeMixRGB'),None);dot=next((n for n in nodes if n.bl_idname=='ShaderNodeVectorMath' and n.operation=='DOT_PRODUCT'),None)
  r['materials'].append({'name':m.name,'map_range':{'from_min':mpn.inputs['From Min'].default_value,'from_max':mpn.inputs['From Max'].default_value,'to_min':mpn.inputs['To Min'].default_value,'to_max':mpn.inputs['To Max'].default_value,'interpolation':mpn.interpolation_type} if mpn else None,'mix_bg':list(mix.inputs[2].default_value) if mix else None,'dot_forward':list(dot.inputs[1].default_value) if dot else None,'links':len(m.node_tree.links)})
for c in bpy.data.collections:
 if any(o.name=='AUTHOR_EDIT_ALL • protected point baseline' for o in c.objects) or 'PREVIEW' in c.name:r['collections'].append({'name':c.name,'objects':len(c.objects)})
try:
 st=mp.scan_state(scene,False);r['guard']='PASS';r['midpoints']=len(st['mid_records']);r['author_edges']=len(st['edge_rows']);r['roots']=len(st['roots'])
except Exception as e:r['guard']='HOLD';r['guard_error']=repr(e)
print('DISPLAY_DIAG='+json.dumps(r,ensure_ascii=False),flush=True)
