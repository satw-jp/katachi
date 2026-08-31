# SKIN CUDA shadow integration readiness — CUDA-4D

Date: 2026-08-31  
Review branch: `agent/skin-cuda-shadow`  
Reviewed CUDA HEAD: `57a516e7f7702dd5fab213ae056a5ef87f49bf2e`

This is a readiness inventory only. No branch was merged and no production
geometry, FKEI, STL, 3MF, Print #002, or support implementation was changed.
CUDA remains observational: Web is authoritative, `shadow=true`, and
`productionApplied=false`.

## Reviewed branch state

| Ref | Reviewed HEAD | Relationship |
|:---|:---|:---|
| `origin/agent/skin-rebuild` | `f1251cff8e2bcf3ee9b760186368b961859ff519` | Ancestor of the CUDA branch; it has no commits not already present in CUDA. |
| `origin/agent/skin-network-lab` | `57495b984846fdd94ff8e8a2170580e506183b4b` | Five Print #002/support commits after common base `de9d25ed7de266d52e61387775eee733d0921a6c`. This is the integration target to re-check immediately before CUDA-5. |
| `origin/agent/skin-cuda-shadow` | `57a516e7f7702dd5fab213ae056a5ef87f49bf2e` | CUDA-4A/4B/4C complete and pushed. |

The five network-lab-only commits modify Print #002/support and related
production files. A three-way merge simulation reports both-side edits only
for `src/studies/skin/manifest.json` and
`src/studies/skin/rebuild/README.md`. Those two files must be resolved in favor
of the target branch and updated manually; they are not reasons to merge CUDA
geometry into production.

Most importantly, the CUDA delta after the common base does **not** modify:

- `src/studies/skin/rebuild/model.ts` or its production sampling/routing logic;
- `src/studies/skin/rebuild/fkei.ts` or FKEI meaning;
- `src/studies/skin/meshExport.ts`, STL, or 3MF generation;
- `src/studies/skin/internalPrintGate.ts`, support geometry, or Print #002;
- `src/studies/skin/main.ts` or production UI wiring.

## A. Suitable for production integration

These are optional shadow infrastructure. They do not make CUDA authoritative.

### Portable semantic boundary and local client

- `src/studies/skin/rebuild/geometryEngine/contracts.ts`
- `src/studies/skin/rebuild/geometryEngine/resultComparison.ts` (already
  identical on the target)
- `src/studies/skin/rebuild/geometryEngine/shadowEvaluateContainment.ts`
  (already identical on the target)
- `src/studies/skin/rebuild/geometryEngine/webGeometryEngine.ts`
- `src/studies/skin/rebuild/geometryEngine/windowsLocalClient.ts`
- `src/studies/skin/rebuild/geometryEngine/browserBinaryTransport.ts`
- `src/studies/skin/rebuild/geometryEngine/index.ts`

The portable `EvaluateContainmentJobRequest` meaning stays unchanged. JSON is
the reference/debug transport; compact binary and volatile sessions are
transport implementation details. All candidate paths reconstruct and validate
the existing semantic result before comparison.

### Fixed loopback helper and CUDA worker

- `tools/skin-local-engine/server.mjs`
- `tools/skin-local-engine/probe-windows-capability.mjs` (already present on
  the target)
- `tools/skin-local-engine/compiled-executable-adapter.mjs`
- `tools/skin-local-engine/persistent-cuda-worker.mjs`
- `tools/skin-local-engine/compact-binary-transport.mjs`
- `tools/skin-local-engine/shadow-session-cache.mjs`
- `tools/skin-local-engine/bin/katachi-containment-cuda.exe` and its reviewed
  SHA-256 allowlist
- `tools/skin-local-engine/native/CMakeLists.txt` and `native/src/*` for
  reproducibility of the reviewed executable

The helper remains fixed to `127.0.0.1:47658`, requires an allowlisted Origin
and the shadow-only header, enforces Host/body/sample limits, and never accepts
an arbitrary executable path. Session data is process-memory only and bound to
session ID, project fingerprint, algorithm contract, and geometry fingerprint.
It is never stored in FKEI.

### Regression evidence that should accompany runtime code

- `src/studies/skin/rebuild/geometryEngine/geometryEngine.test.ts`
- `tools/skin-local-engine/skin-local-engine.test.mjs`
- `tools/skin-local-engine/persistent-cuda-worker.test.mjs`
- `tools/skin-local-engine/shadow-session-cache.test.mjs`
- `tools/skin-local-engine/cuda-shadow-e2e.mjs`
- `tools/skin-local-engine/fixtures/containment-v1.json`

## B. Keep in lab / benchmark history

These files are evidence and profiling controls, not production runtime inputs:

- `tools/skin-local-engine/benchmarks/*`
- `tools/skin-local-engine/cuda-*-benchmark.mjs`
- `tools/skin-local-engine/browser-shadow-benchmark.html`
- `tools/skin-local-engine/browser-shadow-benchmark.ts`
- `tools/skin-local-engine/fixtures/real-skin-120mm-containment-v1.json`

The 2.5 MiB real-workload fixture is intentionally retained only on the lab
branch. CUDA-5 can regenerate it from `buildSkinRebuildProject()` when needed;
it should not increase the production deployment artifact.

## C. Do not integrate from the CUDA branch

- Do not merge the whole branch. Its ancestry also contains graph lab and
  120 mm study history that the target branch already owns.
- Do not take the CUDA branch copy of `src/studies/skin/manifest.json`; the
  Print #002 target owns current version metadata.
- Do not replace `src/studies/skin/rebuild/README.md`; append a reviewed CUDA
  status note manually after resolving the target's Print #002 text.
- Do not bring benchmark-only package scripts unless maintainers explicitly
  want them in the target branch.
- Do not import any model/FKEI/mesh/support/UI file from CUDA history.
- Do not add CUDA settings to FKEI or make a session ID persistent.

## Proposed small-commit integration sequence

Start a fresh integration worktree from the then-current
`origin/agent/skin-network-lab` (or its reviewed successor), never from a
working directory used by Print #002.

1. `feat(skin-cuda): install fixed shadow helper runtime`
   - Add the reviewed executable/native source, compiled adapter, persistent
     worker, compact transport, volatile session cache, and fixed loopback
     server.
   - Add their Node tests in the same commit.
   - Do not touch manifest, model, FKEI, mesh export, or support code.

2. `feat(skin-cuda): add optional browser shadow client`
   - Update the portable capability/containment contracts and Web reference.
   - Add `browserBinaryTransport.ts` and update `windowsLocalClient.ts`.
   - Preserve JSON and all Web fallback behavior; add browser-side contract
     tests.

3. `test(skin-cuda): verify reviewed rtx shadow path`
   - Add the small conformance fixture and RTX end-to-end harness.
   - Wire only focused test commands into `package.json`; keep benchmark
     commands and large reports out of production integration.

4. `docs(skin-cuda): record shadow-only operating policy`
   - Manually append helper setup, reviewed executable hash, browser Local
     Network Access behavior, and fallback rules to the target documentation.
   - Keep the target manifest/version and Print #002 documentation intact.

5. CUDA-5 UI wiring in a separate commit after all previous commits pass.
   - Add only the minimal Web / Windows RTX 3080 (Shadow) selection or
     auto-detected status.
   - Generate the request from the latest production geometry without changing
     its meaning.
   - A missing helper, timeout, crash, malformed result, identity mismatch,
     classification mismatch, or margin mismatch must leave the Web result
     authoritative.

After each runtime commit, run the focused GeometryEngine/helper tests. Before
merging CUDA-5, run the full regression suite, production build, Windows browser
QA, and Cloudflare/Mac Web-only fallback QA.

## Readiness decision

CUDA-4A through CUDA-4C are ready to be **selectively transplanted** into a
fresh branch based on the latest Print #002 work. They are not ready for a
whole-branch merge, and CUDA is not ready to become authoritative. The real
8,159-sample 120 mm workload measured a 33.83 ms median warm outer-binary full
comparison and 23.39 ms session repeat in the Node application harness; the
real Chrome run was 40.3 ms warm. All identities and classifications matched,
maximum margin delta was `1.580e-7`, and failure preserved the Web result.
