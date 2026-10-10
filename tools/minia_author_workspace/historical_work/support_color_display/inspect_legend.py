import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
s=bpy.context.scene;c=s.camera;o=bpy.data.objects['DISPLAY_ONLY • support distance legend'];bpy.context.view_layer.update()
p=[world_to_camera_view(s,c,o.matrix_world@Vector(v)) for v in o.bound_box]
print('SIZE',o.data.size,'bbox',min(x.x for x in p),min(x.y for x in p),max(x.x for x in p),max(x.y for x in p),'origin',world_to_camera_view(s,c,o.matrix_world.translation)[:])


