# SKIN External STL Host Phase 2 — Usagi Observation

Date: 2026-09-05  
Branch: `agent/skin-external-stl-host-v0`  
Source checkpoint: `3398b48cefe6f6c87d61b06d13771bb32708f5d8`

## A. Selected source

The author-selected candidate was loaded from:

`C:\dev\samples\rabbit_230223.stl`

The browser lab retained the exact source bytes and reported:

- filename: `rabbit_230223.stl`
- SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- byte length: `10215684`
- format: binary STL
- header observation: `Exported from Blender-4.0.2`; no physical-unit metadata was present

## B. Source bounds and interpretation

Raw source bounds, in STL source units:

```text
min = (-2.365046, -0.796358, -1.998656)
max = ( 4.082189,  4.739462,  5.285049)
size = ( 6.447234,  5.535820,  7.283705)
```

The lab required an explicit interpretation before activating the metric Host. The browser-gate candidate used for characterization was:

- `mmPerSourceUnit = 10` — explicit candidate only; author acceptance is pending
- up-axis: `+Y`
- handedness: `right`
- instance transform: identity

Interpreted bounds, in millimetres:

```text
min = (-23.650458, -7.963584, -19.986558)
max = ( 40.821886, 47.394619,  52.850490)
size = ( 64.472344, 55.358203,  72.837048)
```

## C. Topology characterization

The scale-invariant raw and interpreted diagnostics agreed:

- triangles: `204312`
- valid: `204305`
- degenerate: `7`
- welded vertices: `102158`
- metric weld tolerance: `0.00000728370475769043`
- connected components: `1`
- boundary edges: `21`
- non-manifold edges: `0`
- orientation-inconsistency edges: `0`
- watertight diagnostic: `OPEN`

The result is therefore a single-component, consistently oriented, non-manifold-free but open candidate. The 21 boundary edges must remain visible to any later integration decision.

## D. Normal characterization and provisional policy

- adjacent edges: `306447`
- dihedral median / p90 / p95 / max: `1.174686° / 2.767133° / 3.472323° / 90°`
- `>30°`: `27` (`0.00881%`)
- `>45°`: `13` (`0.00424%`)
- `>60°`: `7` (`0.00228%`)

Phase 2 policy evidence is `GEOMETRIC candidate`: the distribution is overwhelmingly low-angle, while a very small set of local transitions reaches 90°. No smoothing or motif-normal substitution was introduced. Phase 3 must inspect whether those local transitions coincide with authorial motif boundaries before choosing a final normal policy.

## E. Host query and browser gate

The external Host lab ran deterministic probes against the interpreted instance:

- `closestSurface`: `PASS`, `7/7` probes
- `raycast`: `PASS`, `6/6` camera probes hit
- browser console errors: `0`
- browser console warnings: `0`
- Windows Chrome displayed the neutral Host mesh with Host ON

## F. Scope boundary

This is characterization only. No persistence, FKEI placement, V6 placement, shell generation, BODY generation, FIELD integration, or STL Host Phase 3 work was performed.
