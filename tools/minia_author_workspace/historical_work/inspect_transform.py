import json,hashlib,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
B=Path('J:/My Drive/codex/2026-09-10/r4-astra-mocomoco-j-my-drive/outputs')
O=Path(__file__).resolve().parents[1]/'outputs'
p=Path('J:/My Drive/codex/2026-09-22/skin-fukei-slice-runner-execution-3/outputs/MINIA_PLA_EDITABLE_REPACKED.3mf')
ns={'m':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
with zipfile.ZipFile(p) as z:
 raw=z.read('3D/3dmodel.model'); model=ET.fromstring(raw)
 components=[dict(c.attrib) for c in model.findall('.//m:component',ns)]
 build=model.find('m:build/m:item',ns);bt=list(map(float,build.attrib['transform'].split()))
 settings=json.loads(z.read('Metadata/project_settings.config'))
a=json.loads((B/'R4_A_F2_PRINT_PREPARATION/A/data/ASSEMBLY.json').read_text())
route=json.loads((B/'R4_ROOT_LAUNCH_R5/routes/MINIA_PLA/data/ROUTE_GEOMETRY.json').read_text())
t=[bt[0]*a['common_plate_translation_mm'][i]+bt[9+i] for i in range(3)]
error=max(abs(x-y) for x,y in zip(t,route['world_to_plate_translation_mm']))
assert error<1e-10
paths={
 'flower_source':B/'R4_D6_SIZE_RHYTHM_V2/data/surface.json',
 'flower_print_assignment':B/'R4_A_F2_PRINT_PREPARATION/A/data/FLOWER_PRINT_ASSIGNMENT.json',
 'support_source':B/'R4_A_F2_PRINT_PREPARATION/A/data/support_geometry.json',
 'addition_id_map':B/'R4_ROOT_LAUNCH_R5/data/ADDITIONS_3MF_ID_MAP.json',
 'assembly':B/'R4_A_F2_PRINT_PREPARATION/A/data/ASSEMBLY.json',
 'route_geometry':B/'R4_ROOT_LAUNCH_R5/routes/MINIA_PLA/data/ROUTE_GEOMETRY.json',
}
locks={k:{'path':str(v),'sha256':hashlib.sha256(v.read_bytes()).hexdigest(),'bytes':v.stat().st_size} for k,v in paths.items()}
report={'status':'TRANSFORM_CHAIN_VERIFIED_FROM_ACTUAL_EDITABLE_METADATA_AND_SOURCE_ASSEMBLY','editable_path':str(p),'model_metadata_sha256':hashlib.sha256(raw).hexdigest(),'components':components,'build':dict(build.attrib),'source_stl_translation_mm':a['common_plate_translation_mm'],'source_world_to_plate_scale':bt[0],'source_world_to_plate_translation_mm':t,'route_translation_error_mm':error,'apply_to_centerline_source_once':True,'do_not_apply_scale_again_to_editor_plate_coordinates':True,'locks':locks,'saved_settings':{k:settings.get(k) for k in ['printer_model','nozzle_diameter','filament_type','layer_height','initial_layer_print_height','nozzle_temperature','nozzle_temperature_initial_layer','textured_plate_temp','textured_plate_temp_initial_layer','sparse_infill_density','sparse_infill_pattern','raft_layers','enable_support','filament_retraction_length']},'settings_are_not_actual_toolpath_or_telemetry':True}
(O/'TRANSFORM_AND_REFERENCE_LOCKS.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'translation':t,'error':error,'settings':report['saved_settings']}))
