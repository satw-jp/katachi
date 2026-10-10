import bpy
obj=bpy.data.objects['AUTHOR_EDIT_ALL • protected point baseline']
print('mode',bpy.context.mode,'v',len(obj.data.vertices),'attrs',[(a.name,a.domain,a.data_type,len(a.data)) for a in obj.data.attributes])
print('anchor',obj.data.attributes.get('anchor_index'),len(obj.data.attributes.get('anchor_index').data) if obj.data.attributes.get('anchor_index') else None)
