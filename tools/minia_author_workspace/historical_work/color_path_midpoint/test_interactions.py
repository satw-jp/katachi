import bpy,bmesh,sys,json,math,traceback
from pathlib import Path
ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');OUT=ROOT/'outputs';WORK=ROOT/'work'/'color_path_midpoint'
sys.path.insert(0,str(OUT/'color_path_midpoint_runtime'))
import midpoint_runtime as rt
from mathutils import Vector

scene=bpy.context.scene;rt.register(enter_edit_mode=True);obj=bpy.data.objects[rt.ANCHOR]
def get_state():return rt.scan_state(scene,True)
def base_index(state,sid):return next(i for i,x in state['id_by_index'].items() if x==sid)
def score(state):
 g,_=rt._graph_state(state);return rt.colorbase.score_graph(g,state['cache']['seeds']),g
def bin_counts():
 coll=bpy.data.collections[rt.DISPLAY]
 return {int(o.get('color_bin',-1)):int(o.get('segment_count',0)) for o in coll.objects if o.type=='CURVE' and o.name.startswith('Support distance •')}
results={}
try:
 # A source midpoint alone subdivides an existing source segment without changing shortest distances.
 s=get_state();_,g0=score(s);d0=rt.nx.multi_source_dijkstra_path_length(g0,s['cache']['seeds'],weight='length_mm')
 si=12000;seg=s['cache']['segments'][si];cand={'kind':'source_segment','segment_index':si,'t':.37,'position':rt._interp(seg['a'],seg['b'],.37)}
 smid=rt._add_point_to_bmesh(s,cand);s1=get_state();_,g1=score(s1);d1=rt.nx.multi_source_dijkstra_path_length(g1,s1['cache']['seeds'],weight='length_mm')
 common=set(d0)&set(d1);maxdelta=max(abs(d0[k]-d1[k]) for k in common)
 assert len(s1['mid_records'])==1 and s1['mid_records'][next(iter(s1['mid_records']))]['stable_id']==smid and maxdelta<1e-7,(len(s1['mid_records']),maxdelta)
 # A second midpoint on the same source subsegment must preserve its total length.
 smid2=rt._add_point_to_bmesh(s1,{'kind':'source_segment','segment_index':si,'t':.73,'position':rt._interp(seg['a'],seg['b'],.73)})
 s1b=get_state();_,g1b=score(s1b);u,v=seg['nodes'];chain=[u,smid,smid2,v]
 split_length=sum(g1b[a][b]['length_mm'] for a,b in zip(chain,chain[1:]));original_length=math.dist(seg['a'],seg['b'])
 assert len(s1b['mid_records'])==2 and abs(split_length-original_length)<1e-7,(split_length,original_length)
 results['source_midpoint_only']={'status':'PASS','stable_ids':[smid,smid2],'max_seed_distance_delta_mm':maxdelta,'same_segment_split_length_mm':split_length,'original_segment_length_mm':original_length,'split_length_delta_mm':abs(split_length-original_length)}
 # F-connect that new midpoint to fixture anchor, then require score change.
 target='A1472:END';mi=next(i for i,x in s1b['id_by_index'].items() if x==smid);ti=base_index(s1b,target)
 bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.verts.index_update()
 for vv in bm.verts:vv.select_set(False)
 bm.verts[mi].select_set(True);bm.verts[ti].select_set(True);bpy.ops.mesh.edge_face_add();bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=True)
 s2=get_state();sc2,g2=score(s2);assert len(s2['roots'])==1
 # Verify graph gains an author-intent edge and at least one color value changes.
 prior,_=score(s1b);changed=sum(1 for k,v in sc2.items() if k in prior and v['effective_distance_mm']!=prior[k]['effective_distance_mm'])
 assert any(d.get('kind')=='AUTHOR_EDIT_DESIGN_INTENT' for *_,d in g2.edges(data=True)) and changed>0,(changed,target)
 results['source_midpoint_F_connection']={'status':'PASS','author_roots':len(s2['roots']),'changed_existing_edge_scores':changed}
 # Split an author F-line at its own middle and verify the graph distance is unchanged.
 root=s2['roots'][0];pair=tuple(sorted((root['a_id'],root['b_id'])));edge=next(e for e in s2['edge_rows'] if e['ids']==pair)
 ebm=bmesh.from_edit_mesh(obj.data);ebm.verts.ensure_lookup_table();ebm.edges.ensure_lookup_table();va=ebm.verts[edge['indices'][0]];vb=ebm.verts[edge['indices'][1]];ee=next(e for e in ebm.edges if set(v.index for v in e.verts)==set((va.index,vb.index)))
 t_before=rt.nx.multi_source_dijkstra_path_length(g2,s2['cache']['seeds'],weight='length_mm')
 am=rt._add_point_to_bmesh(s2,{'kind':'author_edge','root_index':0,'root_t':.5,'edge_t':.5,'edge':ee,'edge_start':va})
 s3=get_state();sc3,g3=score(s3);t_after=rt.nx.multi_source_dijkstra_path_length(g3,s3['cache']['seeds'],weight='length_mm')
 common=set(t_before)&set(t_after);delta=max(abs(t_before[k]-t_after[k]) for k in common)
 assert delta<1e-7 and len([r for r in s3['mid_records'].values() if r['kind']=='author_edge'])==1,(delta,s3['roots'])
 results['author_line_midpoint_split']={'status':'PASS','stable_id':am,'max_seed_distance_delta_mm':delta,'root_cuts':len(s3['roots'][0]['cuts'])}
 # Connect the new author midpoint to another protected endpoint with F.
 mid_i=next(i for i,x in s3['id_by_index'].items() if x==am);other=base_index(s3,'A0464:END')
 ebm=bmesh.from_edit_mesh(obj.data);ebm.verts.ensure_lookup_table();ebm.verts.index_update()
 for vv in ebm.verts:vv.select_set(False)
 ebm.edges.new((ebm.verts[mid_i],ebm.verts[other]));bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=True)
 s4=get_state();sc4,g4=score(s4)
 assert len(s4['roots'])==2 and any(d.get('kind')=='AUTHOR_EDIT_DESIGN_INTENT' for *_,d in g4.edges(data=True))
 results['author_midpoint_F_connection']={'status':'PASS','author_roots':len(s4['roots']),'midpoint_count':len(s4['mid_records'])}
 current=rt.update_colors(scene)
 assert current.get('status')=='CURRENT',current
 results['color_recalculation']={'status':'PASS','display_segments':current['display_segments'],'author_edges':current['author_edge_count'],'source_midpoints':current['source_midpoint_count'],'author_midpoints':current['author_midpoint_count']}
 # Save and reopen scratch copy; confirm topology and registry survive and guard remains valid.
 scratch=WORK/'MIDPOINT_QA_SAVE_REOPEN.blend';bpy.ops.wm.save_as_mainfile(filepath=str(scratch));
 results['pre_reopen_sha256']=rt._sha(scratch);results['expected_vertices']=len(obj.data.vertices);results['expected_edges']=len(obj.data.edges)
 # Deliberately move a source midpoint off its locked segment; validation must HOLD.
 s5=get_state();source_rec=next(r for r in s5['mid_records'].values() if r['kind']=='source_segment')
 mbm=bmesh.from_edit_mesh(obj.data);mbm.verts.ensure_lookup_table();mbm.verts.index_update();mv=mbm.verts[source_rec['vertex_index']];mv.co.x+=.01;bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
 try:rt.scan_state(scene,True);raise AssertionError('off-line midpoint was not held')
 except RuntimeError as e:
  assert 'off locked segment' in str(e),str(e)
  results['off_line_midpoint_guard']={'status':'PASS','issue':str(e)}
 (WORK/'MIDPOINT_QA_EXPECTED.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
 print(json.dumps(results,ensure_ascii=False),flush=True)
except Exception:
 traceback.print_exc();raise
