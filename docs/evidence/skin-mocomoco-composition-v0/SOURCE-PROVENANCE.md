# Source provenance — neutral STL host import

- Reference commit: [87d5225a18dc7a1b8895cc44351db4c000be6261](https://github.com/satw-jp/katachi/commit/87d5225a18dc7a1b8895cc44351db4c000be6261) (`perf(skin): optimize A2 sparse support v2`).
- Read-only source retrieval through the GitHub connector was used because the local Git remote could not authenticate in this environment.
- The migration is limited to the neutral STL parser/query and its directly required diagnostics/volume modules. No A2 Support caller, Runner, or production pipeline file was migrated.
- `externalStlHost.ts` is used for STL parsing, geometric normals, deterministic surface queries, and original source byte/hash retention. `externalStlHostVolume.ts` and `externalStlHostDiagnostics.ts` are included because the host module imports them at runtime; they have no additional runtime dependency outside this trio.
- `src/lib/hash.ts` and Three.js/`STLLoader` are already present in the Fix 1 base and were not copied.
- Two parameter-property declarations in the migrated STL module are expressed as explicit field assignments so Node's built-in strip-only TypeScript test runner can load the parser; runtime behavior is unchanged.

| File | Git blob SHA |
|---|---|
| `src/studies/skin/externalStlHost.ts` | `d5c1db8cfda25e9bb015bc4bc0edc505ad6176d1` |
| `src/studies/skin/externalStlHostVolume.ts` | `aa9d6aab9fdc635084dc5aaeee029a2495b0254e` |
| `src/studies/skin/externalStlHostDiagnostics.ts` | `9dff5a4fb9f72661e2af100762bbc7bfa2683d55` |
