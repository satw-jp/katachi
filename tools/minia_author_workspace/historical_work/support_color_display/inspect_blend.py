import bpy
s=bpy.context.scene
print('cam',s.camera.name if s.camera else None,'res',s.render.resolution_x,s.render.resolution_y)
for c in bpy.data.collections:
 print('COL',c.name,'objects',len(c.objects),'hidden',c.hide_viewport,c.hide_render)
for o in bpy.data.objects:
 if o.get('source_reference') or o.name.startswith('PERMANENT'):
  print('OBJ',o.name,o.type,len(o.data.splines) if o.type=='CURVE' else len(o.data.vertices) if o.type=='MESH' else 0,'source_ref',o.get('source_reference'),'hide',o.hide_viewport,o.hide_render,'matrix',tuple(round(x,3) for row in o.matrix_world for x in row)[:4])
