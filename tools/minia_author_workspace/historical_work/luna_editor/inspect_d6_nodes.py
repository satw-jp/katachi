import bpy,json
p=r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_D6_SIZE_RHYTHM_V2\\blend\\R4_D6_SIZE_RHYTHM_V2.blend'
bpy.ops.wm.open_mainfile(filepath=p)
for n in ['D6_SIZE_RHYTHM_4283','D_BACKARC_63_D6_REFERENCE']:
 o=bpy.data.objects[n]; print(n,'loc',list(o.location),'scale',list(o.scale),'mods',[(m.name,m.type, getattr(m,'node_group',None).name if m.type=='NODES' and m.node_group else None) for m in o.modifiers])
 if o.type=='MESH':
  print('attrs',[(a.name,a.data_type,a.domain) for a in o.data.attributes]);print('nodes',[(n.name,n.bl_idname) for m in o.modifiers if m.type=='NODES' for n in m.node_group.nodes][:60])
 dg=bpy.context.evaluated_depsgraph_get();ev=o.evaluated_get(dg);m=ev.to_mesh();print('eval',len(m.vertices),len(m.polygons),'instances',sum(1 for i in dg.object_instances if i.is_instance));ev.to_mesh_clear()
