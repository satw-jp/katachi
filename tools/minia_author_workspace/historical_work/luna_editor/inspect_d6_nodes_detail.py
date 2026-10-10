import bpy,json
p=r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_D6_SIZE_RHYTHM_V2\\blend\\R4_D6_SIZE_RHYTHM_V2.blend';bpy.ops.wm.open_mainfile(filepath=p)
o=bpy.data.objects['D6_SIZE_RHYTHM_4283']
for mod in o.modifiers:
 if mod.type=='NODES':
  ng=mod.node_group
  for n in ng.nodes:
   print('NODE',n.name,n.bl_idname)
   if n.bl_idname=='GeometryNodeObjectInfo': print('object',n.inputs.get('Object').default_value.name if n.inputs.get('Object').default_value else None,'transform',n.transform_space)
   for s in n.inputs:
    if hasattr(s,'default_value') and s.name not in ('Geometry',):
     try:v=str(s.default_value)
     except:v='?'
     if v!='<bpy_struct, NodeSocketGeometry("Geometry")>':print(' IN',s.name,v[:120])
  for l in ng.links:print('LINK',l.from_node.name,l.from_socket.name,'->',l.to_node.name,l.to_socket.name)
for at in o.data.attributes:
 if at.name in ['physical_scale','orientation','normal','position','flower_id']:
  print('ATTR',at.name, [tuple(x.vector) if at.data_type=='FLOAT_VECTOR' else x.value for x in list(at.data)[:2]])
