# Author Observation — SKIN Artwork / Fabrication / Toolpath Architecture

Date: 2026-09-08
Owner: Author / Research SOL
Status: AUTHOR SYSTEM OBSERVATION / FUTURE SKIN ARCHITECTURE INPUT

## Context

Recent Astra research has progressed from artwork generation through physical adaptation, authored removable Support, Bambu slicing, layer-island analysis, and candidate G-code/toolpath study.

The Author now wants to preserve a stronger separation between **discovering the artwork** and **making that artwork printable**.

The key correction is not that the prior integrated Research was simply wrong. The Research objective evolved, while some of the earlier operating logic still coupled artwork generation and printability too early.

Earlier integrated work often allowed build direction, unsupported demand, printable-frontier logic, and layer causality to influence Permanent Structure while the artwork itself was still being discovered.

The Author's preferred operating model is now:

```text
ARTWORK DISCOVERY
    ↓
AUTHOR GATE / FREEZE
    ↓
FABRICATION ANALYSIS
    ↓
FABRICATION ADAPTATION
    ↓
AUTHORED REMOVABLE SUPPORT
    ↓
TOOLPATH / G-CODE
    ↓
PHYSICAL PRINT / OBSERVATION
    ↓
SELECTIVE PRODUCTION TRANSLATION
```

## Core operating rule

> **Artwork generation and fabrication adaptation are separate gates.**
>
> Fabrication diagnostics may observe Artistic D0, but should not mutate it before Author Gate merely because an island, overhang, unsupported region, or slicer warning exists.

Printability remains important, but before Author Gate it is primarily **diagnostic information**, not an obligation that determines the artwork geometry.

This protects the ability to answer:

- why a branch exists;
- whether a Void relation is artistically important;
- whether a motif / surface relation is valuable independently of manufacturability;
- whether a later fabrication change improved printing or merely changed the artwork.

## Proposed staged model

### 1. ARTWORK D0

Purpose: discover an artwork worth continuing.

Possible concerns include:

- Host / macro shape;
- Void and sight-lines;
- volumetric internal structure;
- botanical / growth behavior;
- surface composition;
- motif scale, density, rhythm, and placement;
- Macro / Meso / Micro hierarchy.

At this stage, island / overhang / connectivity / build-direction analysis may be recorded, but does not automatically rewrite D0.

### 2. AUTHOR GATE / FREEZE

When the Author decides that a candidate is worth seeing physically, freeze:

- artwork geometry;
- generator parameters;
- surface / motif authority;
- Permanent Structure authority;
- scale and orientation under review.

This frozen D0 remains available even when later fabrication variants are created.

### 3. FABRICATION ANALYSIS

Read-only analysis of D0 where possible.

Analyze separately:

- final material connectivity;
- true layer-island births;
- chronological extrusion starts;
- overhang and bridge behavior;
- removal access;
- post-removal load path;
- machine / plate constraints.

Do not collapse these into one generic "printability" number.

### 4. FABRICATION D1

Purpose: create the **minimum Permanent geometry difference required to physicalize D0**.

D1 is not a new artwork search.

Requirements:

- preserve D0 as authority;
- record D0 -> D1 difference explicitly;
- prefer local / shared Permanent connections over broad densification;
- avoid silently replacing the original artwork;
- treat visibility / Void loss caused by D1 as a fabrication cost to review.

### 5. AUTHORED SUPPORT D2

Permanent Structure and removable Support remain separate systems.

Current physical direction:

- Permanent structure approximately 2.2 mm baseline in the current study;
- removable trunk / brace approximately 1.6 mm baseline;
- thin sacrificial BODY contact;
- SKIN Stage 8 remains a fabrication precedent, not a geometry authority for Astra artwork;
- vertical shaft + bounded upper offset / bend + shared brace behavior is preferred over many independent long diagonal rods.

For the current small-opening surface family, the Author set a strong rule:

> **Do not generate authored removable Support inside the shape / Host Void.**

Small openings are not permission to route Support through the interior.

Internal print-island problems should be handled by Permanent D1 logic or actual-print tolerance, not by Inside->Inside removable Support.

### 6. TOOLPATH / G-CODE

Toolpath is now recognized as a separate fabrication layer, not merely the passive output of geometry.

Near-term architecture:

```text
Bambu Studio = base slicer / machine-profile engine
Astra / future SKIN = custom fabrication + toolpath planning layer
```

Bambu Studio should continue to own machine-specific baseline behavior such as:

- printer profile;
- temperatures;
- fan;
- retraction;
- motion / acceleration defaults;
- raft / machine start-end behavior;
- normal slicing baseline.

Astra / future SKIN may study and modify bounded artwork-toolpath behavior such as:

- extrusion start point;
- path direction;
- same-layer execution order;
- rooted-side-first printing;
- bridge direction;
- continuity-first sequencing;
- short removable / sacrificial toolpath where explicitly justified.

The goal is not immediately to replace Bambu Studio with a fully independent slicer.

The more useful near-term question is:

> **Given this artwork, what print motion and ordering allow it to exist physically?**

## Current Author Bambu baseline

For the next B_OPEN toolpath study, use the Author's actual working baseline as authority:

- Printer: `Bambu Lab A1 mini`
- Filament: `Generic PLA @BBL A1M_noretraction`
- Process: `0.20mm Standard @BBL A1M`
- Sparse infill: `100%`
- Raft: `2 layers`
- Automatic Support: `OFF`

Prior 0.24 mm / raft-3 Research profiles should not be treated as the Author's current baseline for this study.

## B_OPEN as first toolpath learning candidate

B_OPEN is the preferred first candidate for toolpath research because the current D1/D2 work has already reduced final material separation and true layer-island births substantially, making it useful for isolating **toolpath-order / start-point behavior** rather than reopening broad geometry research.

The goal of B_OPEN is not to establish a B_OPEN-specific hack as a future SKIN rule.

The Research output should distinguish:

- reusable toolpath principles;
- B_OPEN-specific coordinates / interventions;
- rules likely transferable to A_OPEN / A_PARTICIPATING / B_PARTICIPATING;
- items that still require per-shape re-evaluation.

## Physical-risk policy

The Author wants to print experimental candidates even when artistic / fabrication failure remains possible.

Do not require proof of perfect printability before every physical attempt.

A useful distinction is:

```text
SAFE TO ATTEMPT PRINT
!=
LIKELY TO PRINT PERFECTLY
```

Experimental physical candidates may retain bounded risks such as:

- rough overhang;
- local sag;
- partial collapse;
- Support marks;
- local motif damage;
- unresolved but classified toolpath uncertainty.

These should be documented rather than automatically forcing another geometry-optimization loop.

Continue to HOLD for credible machine-risk conditions such as:

- printer / nozzle / bed collision risk;
- out-of-bounds motion;
- unsafe or mismatched machine profile;
- invalid temperature / extrusion / motion commands;
- a near-certain large spaghetti failure likely to create machine-side risk.

A future gate label may distinguish:

- `READY — EXPERIMENTAL PHYSICAL PRINT`
- `HOLD — MACHINE / TOOLPATH SAFETY RISK`

rather than using one generic HOLD for all uncertainty.

## Future SKIN architecture implication

Before implementing the current Astra research directly into Production SKIN, perform an architecture translation study.

The study should decide what belongs to stable reusable SKIN concepts versus candidate-specific Research logic.

A current candidate architecture is:

```text
1. Artwork
   Host -> Permanent Structure -> Surface / Motif -> D0

2. Fabrication Analysis
   connectivity / island / overhang / bridge / access / removal

3. Fabrication Adaptation
   D0 -> D1 explicit Permanent diff

4. Authored Support
   D1 -> D2 removable fabrication system

5. Toolpath
   Bambu baseline slice -> SKIN/Astra bounded toolpath adaptation

6. Physical Record
   print -> observation -> classified feedback
```

The architecture must preserve the boundaries between these stages so that future shapes and surface families can reuse the fabrication system without inheriting B_OPEN-specific geometry.

## Translation principle

Do not ask Production SKIN to reproduce the current B_OPEN object directly as the architecture.

Instead, separate:

- general generator rules;
- representation / ancestry requirements;
- fabrication classifications;
- reusable Support logic;
- reusable toolpath rules;
- candidate-specific parameters and exceptions.

Only principles that survive Author / physical review should later be translated into C / AB / SKIN Production.

## Current scope

This observation records Author / Research operating intent only.

It does **not** authorize immediate implementation in Production C, AB, Viewer, or SKIN Production.

The next useful evidence is the B_OPEN toolpath / G-code study, followed by an explicit SKIN architecture consultation using the accumulated Research and physical results.
