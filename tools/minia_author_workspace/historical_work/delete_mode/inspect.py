import bpy,json
for o in bpy.data.objects:
 if o.get('source_reference') or (o.type=='MESH' and len(o.data.polygons)>100):
  print(o.name,o.type, len(o.data.vertices) if o.type=='MESH' else '',len(o.data.polygons) if o.type=='MESH' else '',dict(o.items()).keys(),flush=True)
print('SCENE_PATHS',[(k,str(v)[:500]) for k,v in bpy.context.scene.items() if any(w in k.lower() for w in ('path','file','source','ledger'))],flush=True)
