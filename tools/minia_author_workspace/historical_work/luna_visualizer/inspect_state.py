import bpy,json
p=bpy.data.filepath;s=bpy.context.scene
print(json.dumps({'path':p,'state':s.get('route_state'),'stale':s.get('route_stale'),'reason':s.get('route_stale_reason'),'has_summary':bool(s.get('route_summary_json')),'collection':bool(bpy.data.collections.get('ROUTE_OVERLAY')),'overlay_hidden':bpy.data.collections['ROUTE_OVERLAY'].hide_viewport if bpy.data.collections.get('ROUTE_OVERLAY') else None},indent=2))
