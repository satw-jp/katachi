# Research Astra — Removable Support Physical Gate v6

Date: 2026-09-07
Owner: Research SOL
Research worker: Research Astra
Status: READY FOR RESEARCH

## Author / SOL decision — strategy change

The current v5 artwork geometry is good enough to preserve as the working physical-print candidate.

The next goal is **not** to force D0 Permanent Structure to become perfectly support-free before any physical print.

The author wants to move the current result toward a real print now, using a deliberately designed removable Support system where necessary.

Therefore this task changes the gate strategy:

```text
v5 artwork geometry ~= freeze
        -> residual unsupported demand
        -> authored removable Support
        -> minimal slicer fallback only where unavoidable
        -> full-system physical-print candidate
```

The prior D0-only printability work remains useful evidence, but **D0 support-free perfection is no longer a prerequisite for this physical gate**.

## Visual / artwork authority

Use the final v5 geometry as the reference candidate.

Preserve as closely as practical:

- USAGI host legibility;
- botanical / plant-like reading;
- sparse volumetric Permanent Structure;
- current multi-depth occupation and perceptual openness;
- exact authoritative A2 motif construction;
- uniform A2 motif scale `0.5x`;
- motif count `512`;
- material ancestry `512 / 512`;
- one connected artwork body;
- `attachmentMultiplicityTarget = 1` for the main artwork candidate.

Do not restart broad aesthetic exploration.

Do not spend another cycle trying to drive the current `31` layer-diagnostic events to zero by repeatedly deforming the artwork unless a specific local correction is obviously low-cost and visually neutral.

The `31` remaining layer events are **residual diagnostic demand**, not automatically 31 physical failures and not automatically 31 Support elements.

## Core task

Design an **authored removable Support system** around the v5 artwork so that the author can reasonably move to a real physical print.

The Support system should serve the current unsupported demand while remaining:

- removable after printing;
- externally reachable as much as possible;
- visually / semantically separate from the Permanent artwork;
- minimal relative to the unsupported demand;
- reproducible from machine-readable rules rather than Blender-only hand edits;
- compatible with the current build orientation unless a clearly better orientation is demonstrated.

The objective is practical:

> produce a print candidate that looks credible in Blender / Bambu, has a plausible removal strategy, and can be handed to the Author for one real-world print experiment.

## Support semantics

Keep three systems distinct:

```text
PERMANENT_STRUCTURE
AUTHORED_REMOVABLE_SUPPORT
SLICER_FALLBACK_SUPPORT
```

Do not convert removable Support into Permanent artwork merely to satisfy a diagnostic.

Do not claim slicer Support is authored Support.

### Authored removable Support may be

- bed-anchored;
- exterior BODY-anchored where a valid removable contact can be defined;
- branched / shared where one removable path can serve several nearby unsupported regions;
- locally shaped to improve removal access and reduce Support count.

### Authored removable Support must not

- become trapped inside an enclosed interior with no credible extraction route;
- depend on inaccessible internal breakaway fragments;
- route through Void merely because it is geometrically shortest;
- silently fuse to the artwork;
- require destructive removal as the intended workflow;
- become a generic dense lattice / infill volume.

If a Support path partially enters the Host volume, the important criterion is not a blanket coordinate prohibition but **credible post-print accessibility and removability**. Record the access / extraction rationale explicitly.

## Support design from residual demand

Start from the v5 residual evidence:

- D0 Support-OFF still has Bambu floating warning;
- `31` layer-diagnostic events remain;
- D0 Support-ON probe still produces substantial Host-deep Support path;
- v5 artwork appearance is Author-approved enough to freeze.

Do not create one Support per diagnostic event by default.

Cluster residual demand spatially / causally and attempt to serve multiple nearby unsupported regions with the smallest practical authored system.

For every authored Support component record:

- Support ID;
- demand IDs / regions it is intended to serve;
- anchor type: bed / exterior BODY;
- anchor coordinates / surface reference;
- target region / target geometry;
- path geometry;
- shaft / neck dimensions;
- intended contact / separation method;
- nominal gap / actual minimum clearance where relevant;
- predicted removal direction;
- tool / finger access assumption where relevant;
- whether extraction remains possible after neighboring Support is removed;
- whether the component can be removed independently or requires an order.

## Removal-first design

Treat removability as a first-class design variable, not a note added after geometry generation.

Prefer Support that can be removed:

- from outside the Host silhouette;
- through existing openings / Void channels that remain visibly accessible;
- in a clear sequence from outermost to deeper elements;
- without forcing a large rigid Support tree through a smaller opening.

Where useful, design explicit break points / thin necks / segmentation so a Support can be removed in pieces.

Record a **Support removal sequence** as part of the Research package.

A Support route is not acceptable merely because Bambu can slice it.

## D2 candidate — authored removable Support first

Create the main D2 candidate as:

```text
v5 artwork
+ authored removable Support
```

D2 should be the main physical-print candidate if possible.

Evaluate:

- whether Bambu floating warnings remain;
- unsupported / floating regions after authored Support is present;
- Support count / mass / volume;
- contact / gap geometry;
- accessibility / removal sequence;
- whether authored Support itself creates new inaccessible unsupported conditions;
- visual confirmation that artwork geometry was not unintentionally changed.

If multiple Support layouts are plausible, keep the comparison bounded to a small number of useful alternatives, ideally `1–3`, and select one recommended physical candidate.

Do not reopen broad artwork geometry exploration.

## D3 candidate — minimal slicer fallback

Only after D2 authored Support is established, add slicer fallback where genuinely necessary.

Use Bambu slicer Support as a **residual fallback**, not as the primary solution.

Measure and report:

- total slicer Support mass / volume / path length;
- Host-deep Support path length / fraction;
- maximum Host depth reached by slicer Support;
- locations that remain difficult to remove;
- whether those locations can instead be absorbed by authored removable Support;
- whether build-plate-only / Tree / other bounded settings materially improve access.

The target is not necessarily zero slicer Support.

The target is:

> no obviously trapped or inaccessible slicer-Support dependency that makes the physical experiment unreasonable.

If some slicer Support remains in difficult regions but the author can credibly remove it through existing openings, document that rather than automatically blocking the print.

## Physical-gate philosophy

This task deliberately relaxes the previous requirement that D0 alone must first reach support-free physical eligibility.

For this task, the main physical gate is **full-system printability**:

```text
Artwork + authored removable Support + minimal slicer fallback
```

A candidate may advance to `READY FOR AUTHOR PHYSICAL GATE` when:

- artwork geometry remains visually acceptable relative to v5;
- exact A2 `0.5x / 512` and material ancestry `512/512` remain intact;
- authored Support has an explicit removal strategy;
- no clearly trapped authored Support is present;
- residual slicer Support is reduced / localized enough that removal appears practically testable;
- Bambu slice completes with a documented profile;
- `.3mf` is immediately usable by the Author for inspection / printing;
- known risks are documented rather than hidden.

Do **not** require every diagnostic layer-birth event to be zero if actual full-system slicer behavior and removal planning make a physical test reasonable.

Do **not** require a theoretical proof of perfect removability before the first print. This is a Research physical experiment intended to generate real evidence.

## Physical print artifact

Prepare one clearly recommended physical candidate.

At minimum provide:

- final `.3mf` ready to open in Bambu Studio;
- separated `.blend`;
- artwork / authored Support / slicer Support visualization;
- recommended printer / nozzle / material / layer / Support settings;
- orientation and plate placement;
- estimated print time / material;
- removal sequence diagram / annotated images;
- list of high-risk locations to inspect during / after print;
- physical-gate record template.

If useful, also provide a second conservative candidate with slightly more Support, but do not produce a large matrix of variants.

## Evidence required

Include:

- before / after artwork comparison showing v5 geometry preservation;
- authored Support isolated front / oblique / reverse;
- artwork + authored Support views;
- final Bambu Support projection / layer evidence;
- Support-access / removal-path visualization;
- Support component table with demand mapping;
- machine-readable Support geometry / endpoints / gaps / access assumptions;
- D2 / D3 `.3mf`;
- `.blend` with separated collections;
- manifest / hashes / provenance;
- Bambu effective profile / settings;
- reproduction steps.

## Production boundary

This is still a Research prototype.

Do not modify:

- Production C;
- AB baseline;
- authoritative A2 baseline;
- Viewer;
- Production UI / SKIN implementation.

Do not translate the Support generator into Production yet.

However, preserve enough machine-readable semantics that a later bounded Production translation can distinguish:

- Permanent artwork;
- authored removable Support;
- slicer fallback;
- Support demand / target / anchor / gap / removal metadata.

## Outcome labels

Use only:

- `RESEARCH SUPPORT FIX REQUIRED`
- `RESEARCH FABRICATION SYSTEM READY — PHYSICAL UNPROVEN`
- `READY FOR AUTHOR PHYSICAL GATE`
- `PHYSICAL SYSTEM PRINT PASS`
- `HOLD`

Do not return to `RESEARCH STRUCTURE FIX REQUIRED` merely because D0 alone still has residual unsupported demand; under v6, that is no longer the sole gate.

Use `RESEARCH SUPPORT FIX REQUIRED` if the authored removable Support system itself is not credible / removable enough to justify a physical experiment.

## STOP

STOP when either:

1. one practical full-system physical candidate is ready for Author printing; or
2. the Support system cannot be made credibly removable without materially changing the approved artwork.

Do not continue polishing diagnostic counts after a credible physical candidate exists.
