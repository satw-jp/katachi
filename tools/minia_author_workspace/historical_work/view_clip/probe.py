import bpy,json
T=bpy.types.RegionView3D
print(json.dumps([{ 'id':p.identifier,'readonly':p.is_readonly,'type':p.type,'length':getattr(p,'array_length',0)} for p in T.bl_rna.properties if 'clip' in p.identifier or 'lock' in p.identifier]))
