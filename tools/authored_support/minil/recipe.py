"""Source-bound initial candidate dimensions, not a physical certification."""
from .adapter import write, require

def candidate_recipe():
    s=11/15
    geometry={'shaft_radius':.8,'neck_radius':.3,'foot_radius':3.5,'foot_height':.65,
              'neck_offset':1.45,'neck_overlap':.2,'neck_cut':.42,'brace_radius':.8,
              'grid_xy':.3,'grid_z':.2,'column_spacing':3.6,'external_search':30.,
              'external_min_z':55.,'lower_max_z':35.,'branch_min_drop':3.,'brace_step':12.,
              'body_search':25.,'body_min_length':3.5,'body_max_length':23.}
    rows=[{'name':k,'category':'geometry_or_spatial_search','source_value':v,'source_unit':'mm',
           'successful_MINIA_transform':s,'successful_MINIA_final_mm':v*s,'MINIL_value_mm':v*s,
           'rationale':'Initial candidate uses reproduced MINI_A final dimension. Existing MINIL receives no scale.',
           'unverified':'MINIL physical strength and actual toolpath'} for k,v in geometry.items()]
    rows += [{'name':k,'category':'tool_model','source_value':v,'source_unit':'mm','successful_MINIA_transform':'not evidence of real tool dimensions',
              'successful_MINIA_final_mm':None,'MINIL_value_mm':v,'rationale':'Keep source audit probe size; do not scale physical tool model.',
              'unverified':'Real jaw shape, cutting force and the source model 1.5mm near-cut exclusion'} for k,v in [('tool_radius',.6),('tool_start_offset',1.5)]]
    return {'case_id':'MINIL_B115_PROVISIONAL','status':'CANDIDATE_RECIPE','version':2,'scale':s,'existing_artwork_scale':1,
            'geometry':{k:v*s for k,v in geometry.items()},'parameters':rows,
            'tool':{'radius_mm':.6,'start_offset_mm':1.5,'directions':96,'fragment_options':[1,2,3]},
            'numeric':{'intersection_volume_mm3':1e-5*s**3,'base_z_tolerance_mm':1e-6,'ownership_volume_mm3':1e-6},
            'source_rules':['rules/lower_support.py','stages/legacy_af2/lower_braces.py','stages/legacy_v7/demands_anchors.py',
                            'stages/legacy_v7/route_external.py','stages/legacy_v7/route_body.py','stages/legacy_v7/scaffold.py','stages/legacy_v7/audit_new_routes.py'],
            'angle_and_order':{'flower_down_normal_z':-.18,'body_up_normal_z':.1,'rising_horizontal_to_drop_max':1/1.5,
                               'flower_contact_pool':12,'external_column_cap':64,'body_anchor_cap':128,'order':'descending demand Z; deterministic source ID tie break'},
            'unverified':['Physical stability','Toolpath','Actual raft attachment','Actual hand-tool removal'],
            'print_go':False}

def validate_recipe(recipe,ownership):
    require(recipe.get('status')=='CANDIDATE_RECIPE','RECIPE_NOT_BOUND')
    require(recipe.get('existing_artwork_scale')==1,'DOUBLE_SCALE')
    require(recipe.get('support_model_base_plane_z_mm',0)==0,'WRONG_BASE_PLANE')
    require(ownership.get('status')=='PASS' and ownership.get('decision')=='NOT_APPLICABLE_TO_ONE_PIECE','OWNERSHIP_UNBOUND')
    require(recipe['geometry']==candidate_recipe()['geometry'],'UNBOUND_DIMENSION_CHANGE')
    return {'status':'PASS','physical_approval':False}

def save_spec(c):
    recipe=candidate_recipe(); c['recipe']=recipe
    write(c['out']/'RECIPE_MINIL_V2.json',recipe)
    write(c['out']/'FRAME_CONTRACT.json',{'support_model_base_plane_z_mm':0.,
          'assembly_to_machine_transform':None,'physical_raft_top_z_mm':None,
          'cad_frame':'existing cycle2 grounded build frame before common slicer placement',
          'existing_artwork_scale':1,'required_later':'Identical arrangement and raft lift for every artwork and removable Support part.',
          'raft_layers_setting':2,'raft_top_inferred_from_layer_height':False})
    (c['out']/'RECIPE_DECISIONS.md').write_text('''# MINIL candidate recipe decisions

H01: Source geometry and spatial lengths use the successful MINI_A final 11/15 dimensions. Existing MINIL is never rescaled. Dimensionless limits/order are retained. Tool probe remains radius 0.6 mm with source 1.5 mm near-cut exclusion; this is not a measured real tool. Collision volume tolerance scales cubically, not linearly.

H02: Support feet start on CAD Z=0. Machine placement and physical raft top remain unknown until a common assembly slice. Raft 2 is a saved setting only.

H03: Geometry, contacts, births and BODY-only occupancy are derived from fixed MINIL inputs. No old generated Support or selected IDs are inputs. Actual surface anchors replace MINI_A's 3 mm member-radius proxy. An actual BODY projection bounds exterior column search; this differs from the old host SDF and is an explicit adapter limitation. No protected void corridor is certified from this proxy.

H04: Historical split-only carves preserve the one-piece union. Original individual members remain unchanged. The SP004 split halves are compared only, never used to construct the candidate.

H05: Source cut/probe/direction/fragment rules are applied to MINIL. Cutting never deletes a whole support automatically. Remaining fragments and other Support are obstacles. Continuous convex-hull sweeps are conservative and can report false blocking for curved fragments. Physical removal is untested.
''',encoding='utf-8')
    stages={
       'A1_lower_revision':'MINIL_ADAPTER_REQUIRED: actual MINIL lower demands; old selected objects excluded',
       'AF2_lower_support':'MINIL_DERIVED_INPUT: direct shafts/short necks/feet against actual BODY',
       'AF2_lower_braces':'MINIL_DERIVED_INPUT: rising early braces between actual shafts',
       'V4_D2_first_material':'COMMON_CODE: _section_pixels; regenerated MINIL sections',
       'V5_occupancy_rooted':'MINIL_ADAPTER: prior-section BODY-only propagation',
       'V6_selected_support':'NOT_APPLICABLE: no prior MINIL authored Support selected data',
       'V7_demands_anchors':'MINIL_ADAPTER: actual undersides, member parent loads and actual rooted surfaces',
       'V7_external_routes':'MINIL_ADAPTER: rising routes and exterior shaft grid; BODY projection replaces host SDF, void corridor unverified',
       'V7_body_routes':'MINIL_DERIVED_INPUT: earlier rooted actual BODY anchors',
       'V7_outer_body_routes':'MINIL_ADAPTER_REQUIRED: actual flower-rooted anchors; no inferred prior Support credit',
       'V7_scaffold_feet':'MINIL_DERIVED_INPUT: early/rising shaft braces and planar feet',
       'V7_exact_clearance':'COMMON_KERNEL: exact non-target BODY Boolean intersection',
       'V7_removal':'MINIL_ADAPTER: source probe and fragmentation plus retained-fragment obstacles',
       'A0341_N00224_X03795_T00841_specific_repairs':'NOT_APPLICABLE_TO_MINIL: case-specific IDs never consumed',
       'AF2_other_shape_obstacles':'NOT_APPLICABLE_TO_MINIL: only actual fixed MINIL solids are BODY'}
    write(c['out']/'STAGE_PORT_MAP.json',stages)
    return recipe
