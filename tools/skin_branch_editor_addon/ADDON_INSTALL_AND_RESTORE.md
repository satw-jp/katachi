# Install and restore — Author review procedure

Use Windows with Blender 5.2.2 LTS installed. The addon is `SKIN_BRANCH_EDITOR_0.1.0.zip`; verify its SHA against `DISTRIBUTION.json`. The tested distribution and private evidence reside in the Drive-backed path recorded there. Cloud synchronization/sharing is not certified by a local filesystem hash.

## Restore data without editing addon code

Create a **new** folder. Obtain these exact originals from the [archive Drive SHA ledger](../../docs/evidence/minia_author_workspace/DRIVE_ARTIFACTS.json), then copy them into the following layout. The source `.blend`, RUN_007 and all original dependencies remain read-only outside this folder.

```text
chosen-root/
  COLOR_PATH_GRAPH.json.gz
  SUPPORT_DISTANCE_COLORS.json
  host.npz
  color_path_runtime/networkx-3.6.1.zip
  MINIA_LOWER70_BRANCHING_REVIEW.blend
  MINIA_AUTO_100_RUN_007.blend
  PROJECT.json                 # generated below
  AUTHOR_WORK_COPY.blend       # independent copy generated below
```

`DEPENDENCY_MANIFEST.json` contains each canonical relative path and SHA. NetworkX 3.6.1 is an external dependency: retain its original license. The inspected ZIP's BSD-3-Clause text is in `NETWORKX_LICENSE_EXTERNAL.txt`; redistribution is permitted under its notice/disclaimer conditions, but the addon ZIP does not redistribute it. A different installed NetworkX or colliding legacy modules cause HOLD. An isolated Blender session avoids modifying another addon's module environment.

Create the manifest and work copy with the source checkout, not by modifying addon files. In PowerShell set explicit paths; create the isolation directories **before** launching Blender (otherwise Blender can fall back to its normal profile):

```powershell
$dataRoot = 'D:\MINIA-restored'
$isolationRoot = 'D:\MINIA-isolated-profile'
$blenderExe = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
foreach ($folder in @('config','scripts','extensions')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $isolationRoot $folder) | Out-Null
}
$env:BLENDER_USER_CONFIG = Join-Path $isolationRoot 'config'
$env:BLENDER_USER_SCRIPTS = Join-Path $isolationRoot 'scripts'
$env:BLENDER_USER_EXTENSIONS = Join-Path $isolationRoot 'extensions'
& $blenderExe --background --factory-startup --disable-autoexec `
  (Join-Path $dataRoot 'MINIA_LOWER70_BRANCHING_REVIEW.blend') `
  --python-exit-code 1 --python tools/skin_branch_editor_addon/create_project.py -- $dataRoot
```

The generator verifies every required external SHA, decodes the embedded source ledger, binds its SHA/transform/reference map, and creates `AUTHOR_WORK_COPY.blend`. Missing, changed or existing work files/manifests cause HOLD; it never substitutes a different file or overwrites an existing project. Source records needed by this editor are embedded in the verified `.blend`. Historical layerwise context depends on additional binding/locks/height-cache/source files; that old analysis panel is not registered by this addon and is outside the requested editor UI.

## Author's first GUI operation

Launch Blender from the same PowerShell so the isolated environment variables apply. In Preferences → Add-ons → Install from Disk select the verified ZIP, then enable **MINI_A Skin Branch Editor**. Open `AUTHOR_WORK_COPY.blend`. In the MINI_A project panel enter the exact `PROJECT.json` path, then click **Projectを照合してBind**. A file picker, if used, is opened by the Author's explicit UI action.

Check `BOUND`, the protected anchor object and `CURRENT / STALE / HOLD` with the reason. On the copy only: select two points → F → Ctrl+Shift+R; Ctrl+Shift+Alt+A adds a point on a branch. Confirm selection markers, 1/4 views and saved projection/pan. Set X/Y/Z 0–100%, shared or tilted ranges, then explicitly press 「表示範囲を反映」. Input callbacks only mark PENDING. Confirm deselection and clip-aware picking. Select multiple internal intervals and verify flower-connected intervals refuse deletion.

Save the **work copy**, close Blender and reopen it. Saved binding is restored after Blender has initialized the loaded Edit Mesh; state is briefly RESTORING. Failed checks stay HOLD with a reason. A relocated manifest path must be explicitly selected and rebound; no automatic search occurs. To move an already edited project, keep the manifest bytes and all relative files unchanged, select its new manifest path, and bind the moved work copy. The saved absolute manifest pointer may be stale until this explicit action; the manifest SHA remains the project identity.

An unchanged save is a logical geometry/registry/mask no-op, not byte-identical `.blend` serialization. Unknown vertex IDs, moved original points, changed reference fingerprints and face injection remain rejected. Restoration is limited to the tested same-Windows relocation; another PC's install and real GUI acceptance remain UNVERIFIED.

## Release / uninstall / recovery

Press 「操作runtimeを解除」 before disabling/removing the addon. It removes owned classes, keymaps, timers, draw handlers, RNA properties and module/path additions. Work-copy data and original files remain. Enabling again registers project UI only; explicitly bind the open work copy again. On HOLD, use Undo or reopen a known work-copy save, then rebind. Do not overwrite source files or RUN_007.

## External companion is independent

`restore_companion.py --project PROJECT.json --destination NEW_FOLDER --blender-exe ABSOLUTE_EXE` prepares a new companion copy and verifies dependencies. It modifies only Blender executable paths and settings source/bootstrap/host paths; dashboard/run retain UTF-8 BOM and Windows CRLF. It never launches Forms, starts search or resumes a checkpoint. Admin rights are not requested.

The original dashboard's Start/Stop, exclusive lock, USER_STOP/LINK_LIMIT handling, checkpoint binding, fresh verification and latest verified RUN contract remains in the preserved source. The isolated test verifies parsing, lock exit 2 and STOP-file creation; actual Start, dashboard GUI and checkpoint continuation were not executed. Do **not** Start/resume under Issue #58. RUN_008 is prohibited.

Checkpoint, latest_verified, all RUN reports and execution history must be obtained and SHA-verified against the archive ledger together, not replaced with summary JSON. Preserve their bytes in a read-only archive folder. Relocated settings change checkpoint binding; do not change hashes or force resume. Reopening a verified run uses its explicit path after checking both the report's verified flag and the recorded file SHA. RUN_007 is for read-only comparison; open a dedicated independent copy with autoexec disabled, and do not save or explore it. The new companion folder intentionally has no synthesized `latest_verified` or checkpoint.

To launch the external dashboard later at an Author-approved gate, use `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File ...\dashboard.ps1`. Stop creates a cooperative request and is not a process kill. This task neither launched that GUI nor granted a new exploration gate.
