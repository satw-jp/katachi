import bpy,json,pathlib,hashlib,time
import route_v2_panel as panel
O=pathlib.Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs')
s=bpy.context.scene;summary=json.loads(s['route_summary_json'])
assert s['route_state']=='CURRENT' and not s['route_stale']
assert summary['edit_count']==0
assert summary['mode']=='PRINTING_WITH_SUPPORT'
assert abs(summary['model_height_plate_z_mm']-43.2)<.0001
assert summary['after']['targets'][0]['graph_count']==2
assert summary['after']['targets'][0]['verified_model_geometry_route_lower_bound']==2
assert summary['physical_route_count']=='UNVERIFIED'
assert bpy.app.timers.is_registered(panel.poll_ui_state)
assert panel._REGISTERED and 'bl_rna' in panel.MINI_A_PT_route_panel.__dict__
started=time.perf_counter();panel.poll_ui_state();poll_s=time.perf_counter()-started
assert s['route_state']=='CURRENT'
report={'pass':True,'method':'Fresh Blender --factory-startup --background, actual delivered .blend and --python bootstrap followed by read-only verification. No GUI launched.',
        'blend':bpy.data.filepath,'blend_sha256':hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest(),
        'bootstrap':'MINIA_ROUTE_BOOTSTRAP.py','panel_registered':True,'timer_registered':True,'state':s['route_state'],'edit_count':summary['edit_count'],
        'initial_height_mm':summary['model_height_plate_z_mm'],'initial_mode':summary['mode'],'graph_count':2,'geometry_witness_lower_bound':2,
        'poll_seconds':poll_s,'evaluation_seconds':s.get('route_evaluation_seconds'),'physical_route_count':'UNVERIFIED','author_gui':'UNVERIFIED'}
(O/'LAUNCHER_CHECK.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2),flush=True)
