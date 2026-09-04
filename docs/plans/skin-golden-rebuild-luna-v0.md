# Golden Rebuild LUNA — Phase 0 Bootstrap

## Purpose

Golden Rebuild LUNA is a shadow architecture migration target. It observes the
existing Golden LUNA production path through a read-only adapter and introduces
the common Artifact contract without stopping, freezing, or rewriting Golden.

The Phase 0 route is `/skin-golden-rebuild-luna.html`. It is an architecture
migration inspector, not the production authoring surface.

## Golden and Rebuild roles

| Runtime | Role |
| --- | --- |
| Golden LUNA | Moving production reference for authoring, geometry, support, and export |
| Golden Rebuild LUNA | Shadow migration target and parity inspector |

Golden source baseline:

- Branch: `agent/skin-authoring-restoration-v0`
- HEAD: `c93a031569219c95f69d5ee0570e2b6845a0368a`

Phase 0 does not import Golden UI DOM controls or call button handlers. The
adapter receives a frozen runtime projection and does not expose mutation APIs.

## Artifact model

Every derived representation follows the same contract:

```ts
DerivedArtifact<T> {
  data: T | null
  status: "current" | "partial" | "stale" | "unavailable"
  role: string
  provenance: {
    source: string
    sourceFingerprint?: string
    upstream?: string[]
    algorithmVersion?: string
  }
  generatedAt?: number
  fingerprint?: string
}
```

`GraphArtifact` adds `id`, `graph`, and `editable`. The Phase 0 Golden adapter
sets `editable: false`. Data and provenance are cloned and frozen at the
adapter boundary; fingerprints are deterministic SHA-256 values over canonical
data and provenance.

## Graph model

Graph layers are registered independently and are never merged by the Phase 0
orchestration layer:

- `surface-graph`
- `internal-graph`
- `reinforcement`
- `dryweb`
- `removable-support`

The registry only describes availability and graph counts. Production graph
algorithms and the current `.fkei` / Print Snapshot schemas are unchanged.

## Production / Shadow / Experimental

- **PRODUCTION** — Golden LUNA authoring and export path.
- **SHADOW** — Rebuild reads the Golden adapter and compares fingerprint,
  counts, bounds, graph nodes/edges, and provenance.
- **EXPERIMENTAL** — reserved for a future explicit Rebuild result preview.

Phase 0 is SHADOW only. No Rebuild result is applied to production output.

## Migration rules

Each capability follows `OBSERVE → SHADOW → COMPARE → EXPERIMENTAL → PROMOTE`.
Phase 0 implements OBSERVE and COMPARE boundaries only. The first candidate
after this phase is Permanent Reinforcement; it is intentionally not migrated
here.

## Golden contracts

The Phase 0 reference records the current Golden Print contract:

- Critical targets: `166`
- Supported: `156`
- Unsupported: `10`
- Removable Support Graph: `546 nodes / 390 edges`
- Accepted BODY collision: `0`
- Inside-derived support: `0`
- Routes: `vertical 78 / offset-bend 78`
- 3MF / STL / report parity: `PASS`

BODY reference data is kept as an adapter summary only; this phase does not
rebuild or serialize production geometry.

## Current migration status

| Capability | Golden | Rebuild | Status |
| --- | --- | --- | --- |
| Surface Authoring | production | adapter | OBSERVE |
| Field | production | adapter | OBSERVE |
| Surface Graph | production | adapter | OBSERVE |
| Internal Graph | production | adapter | OBSERVE |
| Reinforcement | production | not migrated | TODO |
| DryWeb | production | not migrated | TODO |
| Mesh | production | adapter | OBSERVE |
| Diagnostics | production | adapter | OBSERVE |
| BODY | production | adapter | OBSERVE |
| Removable Support | production | adapter | OBSERVE |
| Export | production | adapter | OBSERVE |

## Phase 0 invariants

The new route has no authoring, geometry, support, export, or FKEI mutation
path. View-layer buttons only change the selected representation label. The
Golden route and Golden worktree remain untouched.
