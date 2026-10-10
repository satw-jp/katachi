from pathlib import Path
W=Path(__file__).resolve().parent
src=(W/'reinforce_plan.py').read_text(encoding='utf-8')
src=src.replace("sid_flower={sid:f for f,anchors in flower_anchors.items() for sid in anchors}","sid_flower={sid:f for f,anchors in flower_anchors.items() for sid in anchors}\nflower_normals={f['id']:Vector(f['normal']).normalized() for f in data['flowers']}")
src=src.replace("if sid_flower.get(ids[j])==f or clear[j]<clear[i]+.25:continue", "if ids[j] in sid_flower or clear[j]<5. or clear[j]-clear[i]<4.:continue\n            inward=(pos[j]-pos[i]).normalized().dot(-flower_normals[f])\n            if inward<.7:continue")
src=src.replace("choices.append((length+.15*max(0,dist.get(node[j],100)-20),i,j))", "choices.append((.6*dist.get(node[j],150)+.4*length-.2*clear[j],i,j))")
src=src.replace("if clear[i]<.27:continue", "if clear[i]<4. or ids[i] in sid_flower:continue")
src=src.replace("if j<=i or length<1. or clear[j]<.27 or not eligible(i,j):continue", "if j<=i or length<1. or clear[j]<4. or ids[j] in sid_flower or not eligible(i,j):continue")
needle="    heap=[]\n"
src=src.replace(needle,"    if reason=='flower_second_branch':\n        f=sid_flower[ids[i]]\n        added[-1].update(flower_id=f,target_surface_depth_mm=clear[j],inward_depth_gain_mm=clear[j]-clear[i],inward_normal_cosine=(pos[j]-pos[i]).normalized().dot(-flower_normals[f]))\n    else:\n        added[-1].update(endpoint_minimum_surface_depth_mm=min(clear[i],clear[j]))\n"+needle)
src=src.replace("(W/'reinforce_plan.json')", "(W/'deep_reinforce_plan.json')")
src=src.replace("print('PLAN_DONE'", "report['flower_connection_rule']={'target_surface_depth_min_mm':5.,'depth_gain_min_mm':4.,'inward_normal_cosine_min':.7,'other_new_links_endpoint_depth_min_mm':4.,'maximum_new_length_mm':10.}\nreport['restart_from_user_file']=True\nreport['supersedes']='MINIA_LOCAL_REINFORCED_REVIEW.blend; none of its additions reused'\n(W/'deep_reinforce_plan.json').write_text(json.dumps({'report':report,'added':added},ensure_ascii=False,indent=2),encoding='utf-8')\nprint('PLAN_DONE'")
(W/'deep_reinforce_plan.py').write_text(src,encoding='utf-8')
src=(W/'reinforce_build.py').read_text(encoding='utf-8').replace('reinforce_plan.json','deep_reinforce_plan.json').replace('MINIA_LOCAL_REINFORCED','MINIA_DEEP_BRANCH')
src=src.replace("局所接続による補強案", "花から奥の枝への接続案")
src=src.replace("花への2本目の接続を優先。", "花から外形より5mm以上奥の枝へ接続。深さの増加4mm以上、内向き方向を優先。")
src=src.replace("'certified_centerline_clearance_mm'])", "'certified_centerline_clearance_mm','flower_id','target_surface_depth_mm','inward_depth_gain_mm','inward_normal_cosine','endpoint_minimum_surface_depth_mm'])")
src=src.replace("{k:r[k] for k in writer.fieldnames}","{k:r.get(k,'') for k in writer.fieldnames}")
(W/'deep_reinforce_build.py').write_text(src,encoding='utf-8')
