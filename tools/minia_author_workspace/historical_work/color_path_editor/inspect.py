import bpy,json
print('PATH',bpy.data.filepath)
print('OBJECTS',len(bpy.data.objects))
for o in bpy.data.objects:
 if ('AUTHOR_EDIT' in o.name or o.get('source_reference') or o.name.startswith('DISPLAY_ONLY')):
  print('OBJ',o.name,o.type,'verts',len(o.data.vertices) if o.type=='MESH' else 0,'edges',len(o.data.edges) if o.type=='MESH' else 0,'hide',o.hide_viewport,o.hide_render,'hide_select',o.hide_select,'colls',[c.name for c in o.users_collection])
print('TEXTS',[t.name for t in bpy.data.texts])
