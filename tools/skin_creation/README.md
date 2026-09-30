# Creation v0 local service

Launch from this checkout using `powershell -File tools/skin_creation/launch.ps1`.
Open http://127.0.0.1:5188/skin-rebuild.html?mode=creation . The launcher refuses occupied ports 5188/5189 rather than stopping another environment. Close its console to stop only its child service. Node dependencies must already be installed (`npm ci` in a new checkout).

Python dependencies: numpy, scipy, trimesh, manifold3d. This machine's existing Python/vendor are launcher defaults, not source-data dependencies. On another machine pass `-Python <python executable> -Vendor <package directory>` or set SKIN_CREATION_PYTHON / ASTRA_RESEARCH_VENDOR. Standard installed packages need no vendor path. No Blender runtime is required.

## Provenance and scope

Copied surface replay from #33 commit 8acbd0e1b1b4db4afa103fc2c042d31f69516b4b (runtime 0e95e2575b2e54f2d3cfee5c60a471b5f8247660); copied internal core/geometry from #36 commit 4597c6f2d890fc891a527f8942ac455f31f03f51 (runtime 2e08a8c3342263976a843fa6ee880fd432641e2c). Old source trees and strict replay validators are untouched. The copied geometry's three FLOWER_COUNT assertions/metadata use actual validated current flower IDs. No old flower-dependent members are reused.

Diameter 2.4 rebuilds actual member solids from immutable generated 2.2 centerlines and terminal-radius proportions; reruns declared material-contact checks. It does not relocate flowers or claim fabrication/Support feasibility. It is not #35 Large radial-cap reuse. Widened geometry is an authoring candidate, not new non-target collision/chronology/print validation. Support and Print GO remain off.

## Portable project

`.skincreation` is a compressed content-addressed ZIP: every unique byte payload appears once, even when referenced by multiple history states. Manifest maps relative logical paths to hash/size. Original assets, both layouts, immutable baseline structures, result geometry, recipes, current cursor/redo tail, comparison, selected candidate, Python generator snapshot and dependency versions travel together. No source path on J: is needed after opening. Embedded code is NOT executed: reopening requires the installed generator identity to match, preventing archive code execution. Runtime dependencies are prerequisites, not bundled executables.

Limits: 512 MiB compressed / 2 GiB logical expanded. Invalid inventory/path/hash/source/version/recipe/history rejects before replacing the current project. Incomplete jobs are not saved or published. Session files and worker logs stay in this task's ignored `outputs/skin-creation-sessions` directory. Browser display JSON is transient and not duplicated in the archive.

`python -m unittest test_creation -v` from this folder runs bounded regression tests. The independent Chrome acceptance runner is `browser_test.mjs`; set SKIN_PLAYWRIGHT_ROOT to an existing node_modules directory containing Playwright. It never attaches to the Author's browser profile.
