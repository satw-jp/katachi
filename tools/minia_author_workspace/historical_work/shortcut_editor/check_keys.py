import bpy,json
r=[]
for kc in bpy.context.window_manager.keyconfigs:
 for km in kc.keymaps:
  for k in km.keymap_items:
   if k.type in {'A','R'} and k.ctrl and k.shift and not k.alt:
    r.append([kc.name,km.name,k.idname,k.type,k.value])
print('KEY_CONFLICTS='+json.dumps(r))
