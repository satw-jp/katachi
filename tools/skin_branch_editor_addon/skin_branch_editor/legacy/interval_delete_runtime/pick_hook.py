def _clip_aware_pick(context,event,state):
    region,rd=quad._window_region_data(context,event)
    if region is None or rd is None:return None
    axis,interval=_region_axis_range(rd,bpy.context.scene)
    area=context.area;xy=(int(event.mouse_x)-region.x,int(event.mouse_y)-region.y)
    if not(0<=xy[0]<region.width and 0<=xy[1]<region.height):return None
    ray_o=view3d_utils.region_2d_to_origin_3d(region,rd,xy);ray_d=view3d_utils.region_2d_to_vector_3d(region,rd,xy).normalized();candidates=[]
    def test(kind,a,b,meta):
        av=list(a);bv=list(b);tlo,thi=(0.,1.)
        if axis is not None and interval is not None:
            clipped=_line_clip(av,bv,axis,*interval,direction=_applied_direction(bpy.context.scene,axis))
            if clipped is None:return
            tlo,thi=clipped;av=_lerp(a,b,tlo);bv=_lerp(a,b,thi)
        va,vb=Vector(av),Vector(bv);u=vb-va;w=ray_o-va;aa=u.dot(u);bb=u.dot(ray_d);dd=u.dot(w);ee=ray_d.dot(w);den=aa-bb*bb
        if aa<1e-12:return
        local=max(0.,min(1.,(dd-bb*ee)/den if abs(den)>1e-12 else .5));point=va+u*local;depth_along=(point-ray_o).dot(ray_d)
        if depth_along<=0:return
        p2=view3d_utils.location_3d_to_region_2d(region,rd,point)
        if p2 is None:return
        pix=math.hypot(float(p2.x)-xy[0],float(p2.y)-xy[1])
        if pix>12:return
        t=tlo+(thi-tlo)*local;fullpoint=_lerp(a,b,t)
        candidates.append({'kind':kind,'position':fullpoint,'pixel_distance':pix,'depth':depth_along,'t':t,**meta})
    for i,seg,lo,hi in _interval_delete.source_pieces(state):
        before=len(candidates)
        test('source_segment',_lerp(seg['a'],seg['b'],lo),_lerp(seg['a'],seg['b'],hi),{'segment_index':i})
        if len(candidates)>before:candidates[-1]['t']=lo+(hi-lo)*candidates[-1]['t']
    if state['bm'] is None:raise RuntimeError('Edit Mode is required for midpoint picking')
    intervals=mp._edge_interval_map(state['roots']);bm=state['bm'];bm.verts.ensure_lookup_table();bm.verts.index_update()
    for edge in bm.edges:
        va,vb=edge.verts;ida=state['id_by_index'].get(va.index);idb=state['id_by_index'].get(vb.index)
        if not ida or not idb:continue
        item=intervals.get(tuple(sorted((ida,idb))))
        if item is None:continue
        ri,tmap=item;pa=list(mp._world(state['obj'],va.co));pb=list(mp._world(state['obj'],vb.co));before=len(candidates)
        test('author_edge',pa,pb,{'root_index':ri,'root_t0':tmap[ida],'root_t1':tmap[idb],'edge':edge,'edge_start':va,'edge_pair_orientation':(ida,idb)})
        if len(candidates)>before:
            c=candidates[-1];c['root_t']=tmap[ida]+(tmap[idb]-tmap[ida])*c['t'];c['edge_t']=c['t']
    return min(candidates,key=lambda c:(c['depth'],c['pixel_distance'])) if candidates else None
