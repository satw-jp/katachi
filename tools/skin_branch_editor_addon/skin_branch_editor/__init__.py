"""MINI_A editor portability v0. Enabling registers UI only; binding is explicit."""
bl_info = {'name': 'MINI_A Skin Branch Editor', 'author': 'satw-jp', 'version': (0, 1, 0),
           'blender': (5, 2, 2), 'location': 'View3D > Sidebar > MINI_A',
           'description': 'Bound project editor; archived heuristic; Author GUI review pending',
           'category': '3D View'}

import base64
import hashlib
import json
from pathlib import Path
import zlib
import bpy
from bpy.app.handlers import persistent
from . import project
from .session import Session

_SESSION = None
_REGISTERED = False
_STATE = 'UNBOUND'
_REASON = 'Select a project manifest, open its work copy, then Bind.'
_LOAD_BUSY = False

def unbind():
    global _SESSION, _STATE, _REASON
    if not _LOAD_BUSY and bpy.app.timers.is_registered(_finish_load):
        bpy.app.timers.unregister(_finish_load)
    if _SESSION is not None:
        _SESSION.stop()
        _SESSION = None
    _STATE = 'UNBOUND'
    _REASON = 'Runtime released; project data retained.'

def bind(path):
    global _SESSION, _STATE, _REASON
    unbind()
    try:
        if bpy.app.version != (5, 2, 2):
            raise RuntimeError('Measured target is Blender 5.2.2 only')
        value = project.validate(path)
        if Path(bpy.data.filepath).resolve() != Path(value['_work_path']):
            raise RuntimeError('Open the manifest work copy first; no other file may be bound')
        scene = bpy.context.scene
        if scene.get('skin_branch_project_sha256'):
            if scene['skin_branch_project_sha256'] != value['_manifest_sha256']:
                raise RuntimeError('Saved project manifest binding changed')
        elif project.sha(bpy.data.filepath) != value['files']['MINIA_LOWER70_BRANCHING_REVIEW.blend']['sha256']:
            raise RuntimeError('First bind requires a byte-identical independent LOWER70 copy')
        _SESSION = Session()
        _SESSION.start(value)
        scene['skin_branch_project_manifest'] = value['_manifest_path']
        scene['skin_branch_project_sha256'] = value['_manifest_sha256']
        _STATE = 'BOUND'
        _REASON = 'GUI acceptance UNVERIFIED; legacy operations on work copy only.'
        return value
    except Exception as exc:
        if _SESSION is not None:
            _SESSION.stop()
            _SESSION = None
        _STATE = 'HOLD'
        _REASON = str(exc)
        raise

@persistent
def _load_pre(_):
    unbind()

@persistent
def _load_post(_):
    global _STATE, _REASON
    path = bpy.context.scene.get('skin_branch_project_manifest')
    if path:
        _STATE = 'RESTORING'
        _REASON = 'Waiting for Blender to finish initializing the loaded edit mesh.'
        if not bpy.app.timers.is_registered(_finish_load):
            bpy.app.timers.register(_finish_load, first_interval=.1)

def _finish_load():
    global _LOAD_BUSY
    path = bpy.context.scene.get('skin_branch_project_manifest')
    if path:
        _LOAD_BUSY = True
        try:
            bind(path)
        except Exception:
            pass  # bind retains a visible HOLD and reason; never falls back.
        finally:
            _LOAD_BUSY = False
    return None

def finish_pending_load_for_test():
    """Headless scripts do not pump timers; call only after open_mainfile has returned."""
    if bpy.app.timers.is_registered(_finish_load):
        bpy.app.timers.unregister(_finish_load)
        _finish_load()

class SKIN_BRANCH_Preferences(bpy.types.AddonPreferences):
    bl_idname = __package__
    manifest_path: bpy.props.StringProperty(name='Project manifest', subtype='FILE_PATH')
    def draw(self, context):
        self.layout.prop(self, 'manifest_path')
        self.layout.label(text='Open the work copy before Bind. No auto-search or optimizer startup.')

class SKIN_BRANCH_OT_bind(bpy.types.Operator):
    bl_idname = 'skin_branch_editor.bind'
    bl_label = 'Projectを照合してBind'
    def execute(self, context):
        try:
            prefs = context.preferences.addons[__package__].preferences
            bind(bpy.path.abspath(prefs.manifest_path))
            return {'FINISHED'}
        except Exception as exc:
            self.report({'ERROR'}, 'HOLD: ' + str(exc))
            return {'CANCELLED'}

class SKIN_BRANCH_OT_unbind(bpy.types.Operator):
    bl_idname = 'skin_branch_editor.unbind'
    bl_label = '操作runtimeを解除'
    def execute(self, context):
        unbind()
        return {'FINISHED'}

class MINIA_OT_quick_point(bpy.types.Operator):
    bl_idname = 'mini_a.quick_point'
    bl_label = '途中に点を追加'
    @classmethod
    def poll(cls, c):
        return bool(_SESSION and _SESSION.active and c.area and c.area.type == 'VIEW_3D' and c.mode == 'EDIT_MESH'
                    and c.active_object and c.active_object.name == 'AUTHOR_EDIT_ALL • protected point baseline')
    def invoke(self, c, e):
        return bpy.ops.mini_a.add_midpoint('INVOKE_DEFAULT')

class MINIA_OT_quick_color(bpy.types.Operator):
    bl_idname = 'mini_a.quick_color'
    bl_label = '色を更新'
    @classmethod
    def poll(cls, c):
        return MINIA_OT_quick_point.poll(c)
    def execute(self, c):
        return bpy.ops.mini_a.update_midpoint_colors('EXEC_DEFAULT')

class SKIN_BRANCH_PT_project(bpy.types.Panel):
    bl_idname = 'SKIN_BRANCH_PT_project'
    bl_label = 'MINI_A Project / 復元'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'MINI_A'
    def draw(self, context):
        layout = self.layout
        layout.label(text=_STATE + ': ' + _REASON[:90])
        prefs = context.preferences.addons.get(__package__)
        if prefs:
            layout.prop(prefs.preferences, 'manifest_path')
        layout.operator('skin_branch_editor.bind')
        layout.operator('skin_branch_editor.unbind')
        layout.label(text='色は全体graph距離・合流の従来heuristic')
        layout.label(text='破損確率・強度・積層途中の保持は未保証')
        layout.label(text='外周花の保持を優先。内部の赤・粗さだけで不良判定しない')
        if _SESSION and _SESSION.active:
            state = context.scene.get('midpoint_editor_state', 'STALE')
            layout.label(text=state + ': ' + context.scene.get('midpoint_editor_reason', '')[:90])

CLASSES = (SKIN_BRANCH_Preferences, SKIN_BRANCH_OT_bind, SKIN_BRANCH_OT_unbind,
           MINIA_OT_quick_point, MINIA_OT_quick_color, SKIN_BRANCH_PT_project)

def register():
    global _REGISTERED
    if _REGISTERED:
        return
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    for fn, coll in ((_load_pre, bpy.app.handlers.load_pre), (_load_post, bpy.app.handlers.load_post)):
        if fn not in coll:
            coll.append(fn)
    _REGISTERED = True

def unregister():
    global _REGISTERED
    unbind()
    for fn, coll in ((_load_pre, bpy.app.handlers.load_pre), (_load_post, bpy.app.handlers.load_post)):
        if fn in coll:
            coll.remove(fn)
    if _REGISTERED:
        for cls in reversed(CLASSES):
            bpy.utils.unregister_class(cls)
        _REGISTERED = False
