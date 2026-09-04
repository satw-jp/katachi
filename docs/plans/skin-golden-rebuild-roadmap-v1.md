# SKIN Golden / Rebuild Roadmap v1

Date: 2026-09-04

## Purpose

This document consolidates the current SKIN development sequence against the plans and architecture notes already stored in the repository.

It does not replace the historical records. It defines how they should be interpreted from this point forward.

Primary references:

- `docs/plans/skin-authoring-restoration-v0.md`
- `docs/plans/skin-to-fab-roadmap-v0.md`
- `docs/architecture/skin-rebuild-network-junction-architecture-20260830.md`
- `docs/architecture/skin-rebuild-current-status-20260831.md`
- `docs/architecture/skin-rebuild-migration-regression-harness-20260830.md`

Repository reference at the time this plan was written:

- branch: `agent/skin-authoring-restoration-v0`
- commit: `c93a031569219c95f69d5ee0570e2b6845a0368a`
- commit message: `feat(skin): simplify support authoring flow`

Any later local-only or uncommitted work is outside this document until it is committed and pushed.

---

## 1. Core decision

From here, SKIN development is split into two coordinated tracks:

```text
Golden LUNA
= current production authoring + print pipeline
= the thing used to make and print the artwork now

Rebuild LUNA
= next-generation Graph / Network / Artifact architecture
= introduced first as observe/shadow infrastructure
= not allowed to drive production geometry until parity and physical gates pass
```

This is not a fork in artistic direction.

Golden preserves the working authoring / diagnostics / support / export chain.
Rebuild develops the future data model and editing architecture beside it.

The current print system is therefore a protected downstream production layer, not the place to experiment with broad Graph migrations.

---

## 2. Existing workflow remains the Golden production sequence

The current Workflow Guide remains valid as the author-facing production order:

```text
1. Base
2. Surface Pattern
3. Inside / Outside
4. Overhang
5. Permanent Reinforcement
6. Final Mesh
7. Final Diagnosis
8. Removable Support / Export
```

The important distinction is that Stages 3–5 are no longer treated as an invitation to broadly migrate the future Network model inside the production path.

Golden uses the current working implementation needed to finish the artwork.
Rebuild handles the architectural replacement separately.

---

## 3. Golden LUNA — immediate production work

Golden LUNA has one job:

> finish the current artwork and produce trustworthy physical evidence without destabilizing the working print pipeline.

Current near-term order:

```text
Current authoring / Stage 8 Golden
↓
Permanent Reinforcement completion
↓
minimum necessary Internal Graph cleanup
↓
current production DryWeb / permanent network
↓
Bouquet integration
↓
Final Mesh / Diagnosis
↓
current offset-bend Removable Support
↓
3MF / STL / report
↓
conventional slicer review
↓
physical print
↓
record physical observations
```

### 3.1 Permanent Reinforcement

This is the next production geometry task.

Goal:

- complete the existing Stage 5B / Permanent Reinforcement path
- preserve the current Stage 8 Golden support result
- avoid broad Network schema migration while doing so
- keep Permanent Reinforcement artwork geometry semantically separate from Removable Support

The historical Integration implementation may be used only by selective porting and regression comparison.
Do not wholesale merge old branches into the Golden branch.

### 3.2 Internal Graph cleanup

Golden cleanup is intentionally limited.

Only do the cleanup required to:

- keep the current artwork coherent
- remove clearly accidental representation defects where safe
- make the current DryWeb / permanent network usable for the artwork
- preserve authored form and current print behavior

Do not turn Golden cleanup into the full future stable-ID / raw-cleaned-simplified migration.
That belongs to Rebuild.

### 3.3 DryWeb / permanent network

The Golden version should be good enough to function as permanent artwork structure in the current piece.

It may use the present data model.

The next-generation Network model, richer curve/profile definitions, stable IDs, author-protected topology, JunctionIntent and Graph simplification remain Rebuild responsibilities.

### 3.4 Bouquet integration

Bouquet work follows the principle that flower, stem, surface, internal structure, support logic and fabrication should eventually read as one continuous object.

For Golden, this means integrating the existing production-capable systems rather than pausing artwork completion for a full architecture rewrite.

### 3.5 Physical Print Gate

A real print remains the gate before Rebuild Network results are allowed to replace Golden production geometry.

Record at minimum:

- permanent member printability
- weak or failed junctions
- shell / Pattern sag or collapse
- visible benefit of the internal structure
- excessive or insufficient permanent network density
- removable support behavior
- lower-surface quality
- minimum practical member diameter
- trapped material or inaccessible regions
- slicer-specific problems

The physical print is evidence, not an automatic approval of the current design.

---

## 4. Golden Stage 8 support is frozen as a regression contract

Current Removable Support is treated as complete unless physical evidence justifies a later change.

Golden invariants:

```text
Critical targets      166
Supported             156
Unsupported           10
Support nodes         546
Support edges         390
accepted BODY collision 0
inside-derived          0
```

Geometry character:

```text
Plate
↓
vertical lower shaft
↓
bend
↓
angled approach
↓
short contact neck
↓
target
```

Required identity/parity rules:

- `supportSource = current-stage8:sparseResult.graph`
- `project.printSupport === sparseResult.graph`
- renderer uses the same current Stage 8 graph
- export uses the same current Stage 8 graph
- no automatic legacy straight-support fallback
- BODY and Support use the same transform
- no export-time geometry rewrite that changes bend/neck/target structure
- 3MF / STL / report fingerprints remain aligned
- Print Readiness warnings do not disable technically valid Artifact Export

A changed metric is not automatically forbidden, but it must never drift silently.

---

## 5. Rebuild LUNA — allowed to begin now, but only in OBSERVE / SHADOW mode

Rebuild may start before the physical print only if it cannot affect production geometry.

### Phase 0 — Pre-migration / Observe

Allowed now:

```text
Artifact contracts
GraphArtifact contracts
stable identity adapters
Golden → Rebuild compatibility adapters
fingerprints
comparison harness
raw / cleaned shadow documents
migration inspector
provenance / lineage audit
```

Not allowed yet:

- cleaned Rebuild Graph driving Final Mesh
- Rebuild Graph replacing Golden `lattice`, `finalGraph` or permanent structure
- Rebuild migration changing Stage 8 Support selection
- opening old FKEI and silently rewriting it to a new schema
- new Network topology becoming production-authoritative without parity evidence

The rule is simple:

```text
OBSERVE
↓
SHADOW
↓
COMPARE
↓
physical gate
↓
EXPERIMENTAL adoption
↓
PROMOTE only after parity / regression evidence
```

---

## 6. Rebuild migration sequence after the physical Print Gate

The repository Network architecture already defines the intended migration direction.
The sequence below is the consolidated execution order.

### Phase 1 — Permanent Reinforcement migration

Represent Golden Permanent Reinforcement as a named Rebuild Graph / Artifact layer while preserving the Golden result.

Requirements:

- stable identity
- provenance to the diagnosed source region / edge
- Golden compatibility projection
- no geometry change by default
- exact or explicitly tolerated parity tests

### Phase 2 — Internal Network migration

Introduce portable Network contracts beside the current `InternalStructureGraph`.

Start with a compatibility path:

```text
old graph
↓
portable Network
↓
old-compatible realization
```

The initial realization should still be straight edges + constant circular profile unless an experiment is explicitly enabled.

### Phase 3 — Raw / Cleaned Graph

Adopt the repository's existing separation:

```text
rawTopology
↓
deterministic Cleanup
↓
cleanedTopology + aliases + lineage + audit
```

Cleanup removes representation defects without creative redesign.
It is not a strength slider.

The cleaned result becomes eligible to drive realization only after Golden equivalence has been demonstrated.

### Phase 4 — Author Simplification / Graph editing

After cleanup is stable, introduce explicit author-controlled structural editing.

Examples:

- edge selection / deletion
- connect / disconnect
- protected nodes / edges
- branch pruning
- density reduction
- terminal-preserving contraction
- later curve relaxation

Simplification must remain separate from Cleanup and must invalidate downstream evidence when it changes topology.

### Phase 5 — Junction / curve / profile architecture

Introduce richer edge realization and junction intent only after the stable topology layer exists.

Potential capabilities:

- polyline / Bezier / spline Network edges
- tapered or custom profiles
- Motif ↔ Network JunctionIntent
- collar / calyx-like transitions
- explicit permanent-artwork vs removable-support disposition

No backend-specific mesh handle or CUDA pointer may become the authoring source of truth.

### Phase 6 — Control Graph → Shape

A future deformation or authoring graph may influence Base Shape, but it must not be conflated with the structural Network or Base Surface Graph.

Recommended separation:

```text
AUTHORING
  Base
  Control / Deformation Graph
  Surface Pattern

STRUCTURE
  Base Surface Graph
  Internal Network
  Reinforcement Graph
  DryWeb / Spider Graph

FABRICATION
  Removable Support Graph
```

`Base Surface Graph` remains placement / adjacency / attachment information.
It is not structural Network topology.

### Phase 7 — New FKEI version

A new FKEI version comes last, not first.

Requirements before migration:

- v1 opens exactly as before
- v1 compatibility realization reproduces current output
- migration is explicit and non-destructive
- Save / Restore round-trip passes
- Web-only fallback works
- failure recovery works
- old files are not silently rewritten on open

During shadow migration, legacy projection remains production-authoritative until equivalence is proven.

---

## 7. Raw / Cleaned / Simplified are separate facts

This distinction is retained from the existing Network architecture and is now a core rule.

```text
raw
= reproducible generator / import result

cleaned
= deterministic representation repair

simplified
= explicit author structural decision

realized geometry
= derived output from topology + curve/profile/junction intent
```

Never silently overwrite raw or cleaned topology with a creative simplification result.

Never treat a final mesh as the only editable source of a Network decision.

---

## 8. Relationship to the existing Network Labs

Existing Graph studies remain valuable evidence, not production defaults.

They include:

- deterministic Cleanup
- Raw / Clean visual comparison
- author-controlled edge Simplification
- terminal-preserving topology contraction

These should be reused as candidate algorithms / fixtures in Rebuild.

Do not copy their observed Low / Medium / High results into Golden as production recommendations without a new review against the current artwork and physical evidence.

---

## 9. Relationship to the existing Authoring Restoration plan

`skin-authoring-restoration-v0.md` remains the historical restoration plan and still defines the essential principle:

> SKIN should behave first as an artwork-making tool while the print system remains a reliable downstream fabrication layer.

What changes in this consolidated roadmap is execution scope:

- Surface Pattern restoration remains Golden and is already the production authoring path.
- Removable Support / Export stays Golden and is treated as frozen.
- broad Network authoring restoration is no longer one large Golden milestone before print.
- only the minimum production network work needed for the current artwork stays in Golden.
- stable-ID Network architecture, raw/cleaned/simplified migration and richer editing move to Rebuild.

This avoids reopening the now-working print pipeline while still preserving the original authoring ambition.

---

## 10. Relationship to SKIN → FAB roadmap

The existing SKIN → Permanent Web → FAB roadmap remains downstream and valid.

The consolidated sequence is:

```text
Golden artwork completion
↓
physical print
↓
small evidence-based corrections
↓
Permanent Internal Web becomes stronger artwork structure
↓
conventional print becomes repeatable
↓
FAB calibration
↓
controlled deterministic G-code variation
```

FAB must not be used to compensate for invalid artwork geometry or an unstable Permanent Web.

Golden / Rebuild concerns geometry and authoring architecture.
FAB remains a later fabrication-expression layer.

---

## 11. Promotion rule

A Rebuild capability may replace Golden production behavior only when all relevant gates pass.

Minimum promotion evidence:

- same semantic source inputs
- stable fingerprints / provenance
- current Golden fixture parity
- no Stage 8 support regression unless intentionally reviewed
- FKEI compatibility preserved
- Web fallback preserved where required
- tests / TypeScript / build / browser checks pass
- physical evidence does not contradict the proposed migration
- rollback to the previous Golden remains possible

Until then, Rebuild is shadow or experimental.

---

## 12. Immediate next actions

### Golden

```text
1. Permanent Reinforcement
2. minimum Internal Graph cleanup
3. current DryWeb / permanent network
4. Bouquet integration
5. Final Mesh / Diagnosis
6. current offset-bend Stage 8 Support
7. 3MF / slicer review
8. physical print
9. record physical observations
```

### Rebuild in parallel

```text
1. Artifact / GraphArtifact contracts
2. stable-ID compatibility adapter
3. Golden fingerprint / comparison harness
4. raw / cleaned shadow document
5. provenance / lineage audit
6. migration inspector
```

Stop Rebuild at this boundary until the physical Print Gate is recorded.

---

## Guiding principle

```text
Golden proves the artwork.
Rebuild proves the architecture.
Physical printing decides when the architecture is allowed to replace the Golden path.
```
