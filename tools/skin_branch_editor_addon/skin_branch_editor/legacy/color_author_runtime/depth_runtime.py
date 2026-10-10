"""Viewport-following brightness cue for the colored MINI_A path display."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector

OUT=Path(__file__).resolve().parent.parent
RUNTIME=Path(__file__).resolve().parent
if str(RUNTIME) not in sys.path:sys.path.insert(0,str(RUNTIME))
import midpoint_runtime as midpoint

DISPLAY=midpoint.DISPLAY
PANEL_CATEGORY=midpoint.PANEL
FAR_FACTOR=.24
BG=(.012,.016,.025,1.0)
_BASE_UPDATE=midpoint.update_colors
_MATERIALS={}
_BOUNDS=None
_LAST_VIEW=None
_REGISTERED=False

def _ensure_data(scene=None):
    global _BOUNDS
    cache,score,cache_sha,score_sha=midpoint._read_data(scene)
    if _BOUNDS is None:
        points=[p for seg in cache['segments'] for p in (seg['a'],seg['b'])]
        _BOUNDS=([min(float(p[i]) for p in points) for i in range(3)],
                 [max(float(p[i]) for p in points) for i in range(3)])
    return score

def _range(direction):
    lo,hi=_BOUNDS
    values=[sum(float(p[i])*float(direction[i]) for i in range(3)) for p in ((x,y,z) for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (lo[2],hi[2]))]
    a,b=min(values),max(values)
    if b-a<1e-5:b=a+1e-5
    return a,b

def _make_material(index,rgb):
    label='cyan' if index==-2 else ('gray' if index==-1 else f'{index:02d}')
    name=f'MINI_A depth color • {label}'
    mat=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color=(*[float(x) for x in rgb[:3]],1.0);mat.use_nodes=True
    nt=mat.node_tree;nt.nodes.clear();nodes=nt.nodes;links=nt.links
    geom=nodes.new('ShaderNodeNewGeometry');geom.location=(-700,60)
    dot=nodes.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.location=(-480,60)
    depth=nodes.new('ShaderNodeMapRange');depth.location=(-250,60);depth.clamp=True
    depth.inputs['To Min'].default_value=1.0;depth.inputs['To Max'].default_value=FAR_FACTOR
    mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX';mix.location=(0,80)
    mix.inputs['Color1'].default_value=BG;mix.inputs['Color2'].default_value=(*[float(x) for x in rgb[:3]],1.0)
    emission=nodes.new('ShaderNodeEmission');emission.location=(230,80);emission.inputs['Strength'].default_value=1.0
    output=nodes.new('ShaderNodeOutputMaterial');output.location=(450,80)
    links.new(geom.outputs['Position'],dot.inputs[0]);links.new(dot.outputs['Value'],depth.inputs['Value'])
    links.new(depth.outputs['Result'],mix.inputs['Fac']);links.new(mix.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs['Emission'],output.inputs['Surface'])
    _MATERIALS[index]=mat
    return mat

def _install_depth_materials(scene=None):
    scene=scene or bpy.context.scene;score=_ensure_data(scene)
    palette=score['palette'];unknown=score.get('unknown_color',[.34,.38,.43])
    for i in range(32):
        rgb=list(midpoint.colorbase._color_material(i,unknown).diffuse_color[:3])
        if i not in _MATERIALS:_make_material(i,rgb)
    if -1 not in _MATERIALS:_make_material(-1,unknown)
    coll=bpy.data.collections.get(DISPLAY)
    if coll:
        for obj in coll.objects:
            if obj.type!='CURVE' or not obj.name.startswith('Support distance •'):continue
            b=int(obj.get('color_bin',-1));b=b if 0<=b<32 else -1
            obj.data.materials.clear();obj.data.materials.append(_MATERIALS[b])
            for spline in obj.data.splines:spline.material_index=0
    preview=bpy.data.collections.get(midpoint.PREVIEW)
    if preview:
        for obj in preview.objects:
            if obj.type=='CURVE' and obj.get('display_only'):
                b=int(obj.get('color_bin',-1));b=b if 0<=b<32 else -1
                obj.data.materials.clear();obj.data.materials.append(_MATERIALS[b])
                for spline in obj.data.splines:spline.material_index=0
    if scene.world:
        scene.world.use_nodes=True
        bg=scene.world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs['Color'].default_value=BG;bg.inputs['Strength'].default_value=1.0
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                shade=area.spaces.active.shading
                shade.type='MATERIAL';shade.color_type='MATERIAL';shade.use_scene_world=True;shade.use_scene_lights=False;shade.background_type='WORLD'
    _refresh_view(scene,force=True)

def _refresh_view(scene=None,force=False,direction=None):
    global _LAST_VIEW
    scene=scene or bpy.context.scene
    if direction is None:
        screen=bpy.context.screen
        area=next((a for a in screen.areas if a.type=='VIEW_3D'),None) if screen else None
        if area is None:return False
        direction=area.spaces.active.region_3d.view_rotation @ Vector((0,0,-1))
    forward=Vector(direction).normalized();lo,hi=_range(forward)
    key=tuple(round(float(x),5) for x in (*forward,lo,hi,bool(scene.get('depth_cue_enabled',True))))
    if not force and key==_LAST_VIEW:return False
    enabled=bool(scene.get('depth_cue_enabled',True))
    far=FAR_FACTOR if enabled else 1.0
    for mat in _MATERIALS.values():
        nodes=mat.node_tree.nodes
        dot=next(n for n in nodes if n.bl_idname=='ShaderNodeVectorMath')
        depth=next(n for n in nodes if n.bl_idname=='ShaderNodeMapRange')
        dot.inputs[1].default_value=forward
        depth.inputs['From Min'].default_value=lo;depth.inputs['From Max'].default_value=hi
        depth.inputs['To Min'].default_value=1.0;depth.inputs['To Max'].default_value=far
    _LAST_VIEW=key
    scene['depth_view_forward_json']=json.dumps([float(x) for x in forward],separators=(',',':'))
    return True

def _timer():
    if not _REGISTERED:return None
    try:_refresh_view()
    except Exception as exc:
        scene=bpy.context.scene
        if scene:scene['depth_cue_error']=repr(exc)
    return .3

def _update_colors(scene=None):
    result=_BASE_UPDATE(scene)
    if result.get('status')=='CURRENT':
        try:
            _install_depth_materials(scene)
            if scene:scene['depth_cue_error']=''
        except Exception as exc:
            if scene:scene['depth_cue_error']=repr(exc)
            return {'status':'HOLD','issues':['depth display material: '+repr(exc)]}
    return result

class MINI_A_OT_toggle_depth(bpy.types.Operator):
    bl_idname='mini_a.toggle_depth_cue';bl_label='奥行き表示を切り替え';bl_options={'REGISTER','UNDO'}
    def execute(self,context):
        s=context.scene;s['depth_cue_enabled']=not bool(s.get('depth_cue_enabled',True));_refresh_view(s,True)
        return {'FINISHED'}

class MINI_A_PT_depth(bpy.types.Panel):
    bl_label='奥行き表示';bl_idname='MINIA_PT_depth_cue';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category=PANEL_CATEGORY
    def draw(self,context):
        enabled=bool(context.scene.get('depth_cue_enabled',True));self.layout.label(text='手前は鮮明、奥は背景へ薄く')
        self.layout.operator('mini_a.toggle_depth_cue',text='奥行き表示: '+('ON' if enabled else 'OFF'),icon='HIDE_OFF' if enabled else 'HIDE_ON')
        self.layout.label(text='色相は距離色を保持')

def register(enter_edit_mode=True):
    global _REGISTERED,_LAST_VIEW
    midpoint.update_colors=_update_colors
    _MATERIALS.clear();_LAST_VIEW=None
    if not _REGISTERED:
        bpy.utils.register_class(MINI_A_OT_toggle_depth);bpy.utils.register_class(MINI_A_PT_depth)
        _REGISTERED=True
    scene=bpy.context.scene
    if 'depth_cue_enabled' not in scene:scene['depth_cue_enabled']=True
    midpoint.register(enter_edit_mode=enter_edit_mode)
    _install_depth_materials(scene)
    if not bpy.app.timers.is_registered(_timer):bpy.app.timers.register(_timer,first_interval=.3,persistent=True)
    return True

def unregister():
    global _REGISTERED
    if not _REGISTERED:return
    if bpy.app.timers.is_registered(_timer):bpy.app.timers.unregister(_timer)
    for cls in (MINI_A_PT_depth,MINI_A_OT_toggle_depth):
        try:bpy.utils.unregister_class(cls)
        except RuntimeError:pass
    midpoint.update_colors=_BASE_UPDATE;_REGISTERED=False
