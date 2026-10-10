import bpy,json
p=r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_D6_SIZE_RHYTHM_V2\\blend\\R4_D6_SIZE_RHYTHM_V2.blend'
bpy.ops.wm.open_mainfile(filepath=p)
rows=[]
for o in bpy.data.objects:
 rows.append({'name':o.name,'type':o.type,'vertices':len(o.data.vertices) if o.type=='MESH' else None,'splines':len(o.data.splines) if o.type=='CURVE' else None,'collections':[c.name for c in o.users_collection]})
print(json.dumps(rows[:150]))
