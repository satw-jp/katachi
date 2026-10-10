# MINI_A Skin Branch Editor 0.1.0

Authority: [Issue #58](https://github.com/satw-jp/katachi/issues/58) → [bounded task](../../docs/tasks/MINIA_BLENDER_ADDON_PORTABILITY_V0.md). Fixed source: `c75d4b0adcf04b0ad8bde7810dc906e72c36e948`. Decision owner / GUI acceptance: Author.

Windows / Blender **5.2.2 LTS d13f752e3b9c** is the measured target. This is a legacy installable addon ZIP (`bl_info`, Preferences → Add-ons → Install from Disk), not an Extension repository package. It uses Blender's installed Python and needs no network/API at runtime. Other Blender versions/platforms fail the bind gate or remain unverified.

Enabling registers only project UI, shortcut wrapper classes and two project lifecycle callbacks. It does not activate editing on the open file. The Author explicitly opens an independent work copy and binds a project manifest. Each bind verifies the pinned external hashes, source ledger, scale/transform and protected references before invoking the archived editor. No "latest" fallback or optimizer startup exists.

The archive under `tools/minia_author_workspace` remains unchanged. `skin_branch_editor/legacy/` is a byte-identical source copy, including same-name historical modules. `session.ORDER` selects the current modules explicitly; it does not combine their implementations. `RUNTIME_INVENTORY.json` lists original imports, registration sites and paths; `LEGACY_SOURCE_HASHES.json` lists copied source SHA-256 values.

Read [install and restore](ADDON_INSTALL_AND_RESTORE.md), [parity matrix](LEGACY_BEHAVIOR_MATRIX.md), [dependency manifest](DEPENDENCY_MANIFEST.json), [test results](TEST_RESULTS.json), [result](RESULT.md) and [CURRENT](CURRENT.md).

## Build

From the repository root, using a Python 3 interpreter:

```powershell
& $pythonExe tools/skin_branch_editor_addon/build_zip.py `
  --output 'D:\MINIA-distribution\SKIN_BRANCH_EDITOR_0.1.0.zip'
Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\MINIA-distribution\SKIN_BRANCH_EDITOR_0.1.0.zip'
```

The ZIP includes editor code and dependency/source manifests; no `.blend`, host, graph cache, NetworkX ZIP or checkpoint. It also retains the old companion source as passive source files. The addon never invokes companion/optimizer entrypoints. ZIP timestamps and file ordering are fixed for reproducibility.

`prepare_evidence.py` audits all originals read-only and creates fresh copies. It refuses existing dependency destinations and is an evidence preparation command, not an Author project launch command. Do not execute `historical_work/` builders.

## Verification commands

`run_test.ps1` creates and verifies isolated config/scripts/extensions directories before addon installation. Run phases `lifecycle`, `synthetic`, `copy`, `reopen` against a fresh evidence folder prepared by the recorded procedure. `run_operations.ps1` applies explicit editor operations on independent LOWER70 copies; `-Oracle` loads the pinned archived source through the same lifecycle adapter for kernel comparison. It does not reproduce legacy GUI bootstrap timing. Operation outputs are private Drive artifacts and must not be committed.

No OS GUI automation or production Blender installation was performed. Author acceptance covers viewport projection/pan, mouse picking, selection overlay, native clip, readability and shortcut conflicts. Headless results do not grant GUI or physical acceptance.
