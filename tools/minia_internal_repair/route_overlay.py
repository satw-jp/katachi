"""Display-only Blender overlay for the MINI_A route graph."""
import bpy, math
from mathutils import Vector

ROOT_NAME='ROUTE_OVERLAY'
SUBS=('ROUTE_HEIGHT','ROUTE_CLIPPED_CENTERLINES','ROUTE_COMPONENT_BBOXES','ROUTE_WITNESS_SCHEMATIC','ROUTE_FAILURE_IMPACT')

def _collection(name,parent):
 c=bpy.data.collections.get(name)
 if c is None:c=bpy.data.collections.new(name)
 if c.name not in [x.name for x in parent.children]:parent.children.link(c)
 return c

def ensure_overlay():
 root=_collection(ROOT_NAME,bpy.context.scene.collection)
 for n in SUBS:_collection(n,root)
 root.hide_viewport=True;root.hide_render=True
 return root

def hide_overlay(hide=True):
 root=bpy.data.collections.get(ROOT_NAME)
 if root:root.hide_viewport=hide;root.hide_render=hide

def _clear(root):
 for c in list(root.children):
  for o in list(c.objects):
   data=o.data;bpy.data.objects.remove(o,do_unlink=True)
   if data and data.users==0:
    if isinstance(data,bpy.types.Mesh):bpy.data.meshes.remove(data)
    elif isinstance(data,bpy.types.Curve):bpy.data.curves.remove(data)

def _material(name,color):
 m=bpy.data.materials.get(name)
 if not m:m=bpy.data.materials.new(name);m.diffuse_color=(*color,1)
 return m

def _curve(name,paths,collection,material,radius=.055,dashed=False):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=radius;cu.bevel_resolution=0;cu.resolution_u=1
 for coords in paths:
  if len(coords)<2:continue
  if dashed:
   for a,b in zip(coords,coords[1:]):
    va,vb=Vector(a),Vector(b);length=(vb-va).length
    if length<1e-5:continue
    pieces=max(1,int(length/1.3));dash=length/(pieces*1.8)
    for i in range(pieces):
     lo=(i/pieces)*length;hi=min(length,lo+dash);sp=cu.splines.new('POLY');sp.points.add(1)
     sp.points[0].co=(*(va+(vb-va)*(lo/length)),1);sp.points[1].co=(*(va+(vb-va)*(hi/length)),1)
  else:
   sp=cu.splines.new('POLY');sp.points.add(len(coords)-1)
   for p,v in zip(sp.points,coords):p.co=(*v,1)
 ob=bpy.data.objects.new(name,cu);collection.objects.link(ob);ob.data.materials.append(material);ob['display_only']=True;ob['manufacturing_geometry']=False;ob['route_overlay']=True;return ob

def _bbox_paths(bb):
 lo,hi=bb;v=[(x,y,z) for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (lo[2],hi[2])]
 edges=[]
 for i in range(8):
  for bit in (1,2,4):
   j=i^bit
   if j>i:edges.append((v[i],v[j]))
 return [[a,b] for a,b in edges]

def _center(bb):return [(bb[0][i]+bb[1][i])*.5 for i in range(3)]

def _interpolate(points,t):
 i=min(int(t),len(points)-2);f=t-i
 return [points[i][k]*(1-f)+points[i+1][k]*f for k in range(3)]

def _interval_points(points,interval):
 lo,hi=interval;res=[_interpolate(points,lo)]
 res.extend(points[i] for i in range(math.ceil(lo),math.floor(hi)+1))
 res.append(_interpolate(points,hi));return res

def rebuild(ctx,result,before_result=None,edits=()):
 root=ensure_overlay();_clear(root)
 ch={n:bpy.data.collections[n] for n in SUBS}
 mode=result['mode'];h=result['model_z_mm'];graph=ctx.cache[result['cache_key']][0]
 target=next(iter(result['targets']),{});focus_obj=bpy.data.objects.get('F3457 • D6 template proxy at exact source position/orientation')
 focus=list(focus_obj.get('position_plate_mm',[40.,95.,43.])) if focus_obj else [40.,95.,43.]
 radius=36.0
 gray=_material('Route overlay • unknown / declared gray',(.36,.40,.46));orange=_material('Route overlay • selected / hypothetical',(.95,.36,.08));plane_mat=_material('Route overlay • height plane',(.36,.52,.62));bbox_mat=_material('Route overlay • component extent',(.56,.39,.68))
 _curve('Model height plane • clip frame',[[[focus[0]-radius,focus[1]-radius,h],[focus[0]+radius,focus[1]-radius,h],[focus[0]+radius,focus[1]+radius,h],[focus[0]-radius,focus[1]+radius,h],[focus[0]-radius,focus[1]-radius,h]],[[focus[0]-radius,focus[1],h],[focus[0]+radius,focus[1],h]],[[focus[0],focus[1]-radius,h],[focus[0],focus[1]+radius,h]]],ch['ROUTE_HEIGHT'],plane_mat,.035)
 actual=[];centerline=[]
 display_ids={'G0165','C0016','G0181','C0031','A3457','LR002','R5_F3457_P1','R5_F3457_P2','R5_F3457_P3','R5_F3457_P4','R5_F3457_P5','R5_F3457_P6','S002463','S002400','T00661','T00673','X03430'}
 for w in target.get('witnesses',[]):display_ids.update(w.get('branch_ids',[]))
 for nid,d in graph.nodes(data=True):
  if not d.get('bbox'):continue
  c=_center(d['bbox'])
  if abs(c[0]-focus[0])>radius or abs(c[1]-focus[1])>radius:continue
  if d.get('geometry')=='ACTUAL_CLIPPED_COMPONENT':actual.append((nid,d))
  elif d.get('geometry')=='CENTERLINE_CLIP_APPROXIMATION' and d.get('member_id') in display_ids:centerline.append((nid,d))
 for nid,d in actual:
  ob=_curve('SEPARATE COMPONENT EXTENT • '+nid,_bbox_paths(d['bbox']),ch['ROUTE_COMPONENT_BBOXES'],bbox_mat,.045)
  ob['fragment_id']=nid;ob['physical_member_id']=d.get('member_id');ob['display_semantics']='bbox of a separate clipped component; not its surface; never merge by member ID'
 for nid,d in centerline:
  m=ctx.members.get(d.get('member_id'));interval=d.get('interval')
  if m and interval:
   pts=_interval_points(m['points'],interval)
   ob=_curve('CLIPPED CENTERLINE APPROX • '+nid,[pts],ch['ROUTE_CLIPPED_CENTERLINES'],gray,.045)
   ob['fragment_id']=nid;ob['physical_member_id']=d.get('member_id');ob['display_semantics']='declared/centerline clip approximation; not a verified solid'
 author_count=0
 for edit in edits:
  a=list(edit['a_position']);b=list(edit['b_position'])
  if a[2]>h and b[2]>h:continue
  if a[2]>h:
   f=(h-b[2])/(a[2]-b[2]);a=[b[k]+f*(a[k]-b[k]) for k in range(3)]
  if b[2]>h:
   f=(h-a[2])/(b[2]-a[2]);b=[a[k]+f*(b[k]-a[k]) for k in range(3)]
  ob=_curve('DESIGN_INTENT_PREDICTION • '+edit['id'],[[a,b]],ch['ROUTE_CLIPPED_CENTERLINES'],orange,.11)
  ob['branch_id']=edit['id'];ob['display_semantics']='DESIGN_INTENT_PREDICTION / TOOLPATH_UNVERIFIED; clipped at selected model height';author_count+=1
 # Witness path is a schematic of the graph edges. It is always gray because the whole contact graph is incomplete.
 for wi,w in enumerate(target.get('witnesses',[])[:3]):
  path=w.get('fragment_ids',[])
  for a,b in zip(path,path[1:]):
   if a not in graph or b not in graph:continue
   da,db=graph.nodes[a],graph.nodes[b]
   if not da.get('bbox') or not db.get('bbox'):continue
   ca,cb=_center(da['bbox']),_center(db['bbox'])
   if max(abs(ca[0]-focus[0]),abs(ca[1]-focus[1]),abs(cb[0]-focus[0]),abs(cb[1]-focus[1]))>radius:continue
   _curve(f'GRAPH WITNESS SCHEMATIC • {wi+1} • {a} to {b}',[[ca,cb]],ch['ROUTE_WITNESS_SCHEMATIC'],gray,.075,True)
 # Hypothetical single-failure collateral loss: draw only local geometry/clip fragments and label it as impact, not a physical prediction.
 impact=result.get('failure_impact') or {};lost=set(impact.get('lost_fragment_ids',[]))
 for nid in sorted(lost):
  if nid not in graph:continue
  d=graph.nodes[nid];bb=d.get('bbox')
  if not bb:continue
  c=_center(bb)
  if abs(c[0]-focus[0])>radius or abs(c[1]-focus[1])>radius:continue
  _curve('HYPOTHETICAL FAILURE EXTENT • '+nid,_bbox_paths(bb),ch['ROUTE_FAILURE_IMPACT'],orange,.075)
 root['overlay_model_z_mm']=h;root['overlay_mode']=mode;root['overlay_cache_key']=result['cache_key'];root['overlay_target_fragment_ids']=','.join(t['target'] for t in result['targets']);root['component_bbox_count']=len(actual);root['centerline_clip_count']=len(centerline);root['witness_schematic_is_verified']=False
 root.hide_viewport=False;root.hide_render=False
 return {'component_bbox_count':len(actual),'centerline_clip_count':len(centerline),'author_intent_clip_count':author_count,'witness_segment_count':len(ch['ROUTE_WITNESS_SCHEMATIC'].objects),'failure_overlay_count':len(ch['ROUTE_FAILURE_IMPACT'].objects),'target_fragment_ids':[t.get('target') for t in result['targets']],'radius_mm':radius,'plane_z_plate_mm':h}
