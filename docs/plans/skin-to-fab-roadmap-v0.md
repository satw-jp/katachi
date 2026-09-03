# SKIN → Permanent Web → FAB Roadmap v0

Date: 2026-09-03

## Purpose

This document records the intended production sequence after the first printable SKIN checkpoint.

The immediate goal is not to redesign printing. First establish that the current artwork can be printed conventionally. Then use the physical result to refine the artwork, construct the originally intended permanent internal web, and only after ordinary printing is stable introduce FAB as a controlled G-code variation layer.

This roadmap is downstream of the current SKIN Authoring Restoration work.

Related plan:

`docs/plans/skin-authoring-restoration-v0.md`

## Core sequence

```text
Current first printable artwork
↓
Physical print #1
↓
Small artwork adjustments based on the real object
↓
Permanent Internal Web construction
↓
Shell + Web integrated artwork
↓
Conventional print becomes stable and repeatable
↓
FAB baseline calibration
↓
Controlled G-code variation / deliberate material fluctuation
```

The ordering matters. Do not begin experimental G-code behavior before the conventional print baseline is understood.

---

# P0 — First physical print baseline

The current printable checkpoint is the starting physical reference.

Frozen baseline commit:

`f542f84d384fcdda30a815ddfb7b8162af1cf4f1`

Current known Stage 8 state:

- `supportSource = current-stage8:sparseResult.graph`
- `project.printSupport === sparseResult.graph`
- Stage 8 Critical 166 / Supported 156 / Unsupported 10
- Support graph nodes 546 / edges 390
- accepted BODY collision 0
- Inside-derived 0
- current removable support uses offset-bend paths
- 3MF / STL / report fingerprint parity established

The first print is evidence, not the final design.

Its purpose is to reveal what cannot be judged reliably from screen-space diagnostics alone.

Observe at minimum:

- shell stiffness
- weak Pattern connections
- local collapse or sag
- lower-surface quality
- support removal behavior
- actual minimum reliable member thickness
- whether some areas require no additional support at all
- whether the current removable supports are excessive or insufficient
- material-specific artifacts

Do not overreact to the first print by changing the whole system at once.

---

# P1 — Minimal artwork adjustment after physical print

After Print #1, make only the adjustments justified by the real object.

Likely targets may include:

- shell thickness where physically necessary
- local Pattern connection strength
- dangerous isolated overhangs
- excessive gaps
- small geometry corrections
- minimum printable member diameter

The objective is not to solve every fabrication problem with removable support.

The objective is to prepare the artwork for the next intended structural stage: the Permanent Internal Web.

---

# P2 — Permanent Internal Web

This is the originally intended central SKIN structural development.

The Permanent Internal Web is artwork geometry.

It is not Stage 8 removable print support.

Critical distinction:

```text
Permanent Internal Web = artwork / permanent structure

Stage 8 Sparse Support = temporary fabrication assistance
```

The two systems must remain separate in data, rendering, diagnostics, export semantics, and UI.

## Intended role

The internal web should create a thin, printable, mutually supporting network inside the artwork that supports the shell from within.

Conceptually:

```text
Shell / Surface Pattern
        ↕
Thin Permanent Web
        ↕
Other shell regions / structural nodes
```

## Required qualities

The web should be:

- as thin as physically practical
- actually printable
- structurally useful to the shell
- sparse rather than uniformly filling the volume
- contained inside the artwork except for intentional shell connections
- connected as a network rather than a collection of unrelated vertical pillars
- permanent in the final object
- visually meaningful where visible through openings
- integrated with flowers / Surface Pattern / shell / junctions where appropriate
- deterministic from artwork and structural conditions rather than random noise

## Structural direction

Prefer support paths related to actual structural need:

- vulnerable shell zones
- junctions
- Pattern attachment zones
- load-transfer paths
- mutually supporting graph routes

Avoid treating the full interior as generic infill.

The web should become part of the object's form and manufacturing logic simultaneously.

## Geometry relationship

Recommended conceptual pipeline:

```text
Authored Shell / Pattern
↓
Structural need / shell support targets
↓
Permanent Web graph
↓
Printable member realization
↓
Shell + Web integrated artwork
↓
Mesh / diagnostics
↓
Residual Stage 8 removable support only where still required
```

As the Permanent Web becomes effective, Stage 8 removable support should ideally become a residual correction layer rather than the primary supporting system.

---

# P3 — Integrated artwork print

After the Permanent Internal Web is established:

```text
Shell
+
Surface Pattern
+
Permanent Web
+
Permanent Reinforcement
```

should be treated as one artwork system.

Then run normal print diagnostics again.

Stage 8 should support only the remaining regions that cannot be made self-supporting through the permanent artwork structure.

The physical test should answer:

- does the web actually support the shell?
- are web members printable at the chosen diameter?
- do connections fuse reliably?
- is the network too dense?
- does it create unwanted trapped material or print artifacts?
- can removable Stage 8 support be reduced?
- does the visible internal structure contribute positively to the artwork?

Repeat physical adjustment only as needed.

---

# P4 — Conventional fabrication baseline before FAB variation

FAB begins only after the artwork can be printed in an ordinary, repeatable way.

The baseline remains conventional layer-by-layer FDM printing.

Do not begin by changing the fundamental deposition strategy.

Establish a stable baseline using the current printer / slicer workflow first.

For the current Bambu workflow, machine and filament settings may continue to control ordinary fabrication parameters such as:

- raft / bed adhesion strategy
- retraction
- temperature
- cooling
- ordinary print speed
- normal extrusion calibration
- layer height
- nozzle / line-width assumptions

The exact parameters can evolve from physical tests, but they must first produce a known repeatable reference print.

The purpose of this phase is to create a control condition:

```text
Same artwork
+
ordinary slicing
+
stable material profile
=
repeatable baseline print
```

Without this baseline, later material variation cannot be distinguished from ordinary printing failure.

---

# P5 — FAB as controlled G-code intervention

Once conventional printing is stable, FAB becomes an intentional fabrication-expression layer.

FAB should not immediately replace the slicer or rewrite the entire printer workflow.

Initial direction:

```text
SKIN geometry
↓
ordinary slicer / conventional layer stack
↓
known-good G-code baseline
↓
FAB controlled transformations
↓
printer
```

This preserves ordinary layer-by-layer fabrication as the base process while allowing selected deposition behavior to vary deliberately.

## First FAB principle

Variation must be intentional and controllable.

Do not add generic random noise simply to make the print look organic.

The system should be able to compare:

```text
BASELINE
vs
VARIATION
```

from the same artwork and fabrication profile.

## Candidate variation channels

Potential early channels include controlled changes to:

- feed / movement speed
- extrusion amount
- local flow
- retraction behavior where appropriate
- dwell / timing
- local deposition pacing
- selected travel or transition behavior
- later, bounded Z-direction behavior if separately validated

Not all of these should be introduced at once.

Begin with a small number of variables whose physical effects can be measured and understood.

## Important distinction

There are two different layers of fabrication control:

### Stable conventional profile

Used to make the object normally and reliably.

Examples include ordinary Bambu filament / process parameters such as raft and retraction settings.

### FAB expressive variation

Applied intentionally on top of the stable reference process to create material fluctuation.

The baseline should remain reproducible even when FAB variation is disabled.

---

# P6 — Material fluctuation as an authored fabrication property

Longer term, FAB should make deposition behavior part of the artwork rather than an uncontrolled printer defect.

Desired relationship:

```text
Artwork intent
↓
Fabrication variation field / instructions
↓
G-code transformation
↓
Material behavior
↓
Physical trace
```

Possible outputs may include differences in:

- line tension
- sag
- thickness
- local density
- surface irregularity
- rhythm of deposition
- junction character

The important point is that these arise from explicit fabrication instructions, not accidental instability.

The physical imperfection should be reproducible enough to study while still preserving controlled variation.

---

# P7 — Relationship among HANA, SKIN, and FAB

Long-term conceptual division:

```text
HANA
hand / gesture / authoring
↓

SKIN
form / permanent structure / physical viability
↓

FAB
material deposition behavior / controlled fabrication variation
```

A useful concise interpretation is:

```text
HANA = how the form is drawn
SKIN = how the form stands
FAB  = how the material is laid down
```

These systems should exchange explicit data while remaining conceptually separable.

FAB must not erase the geometry and structural decisions made by HANA / SKIN.

---

# Near-term execution order

Do not jump directly to the final FAB vision.

Proceed in this order:

```text
1. Complete current physical print
2. Record physical observations
3. Perform small justified artwork corrections
4. Restore / stabilize SKIN authoring workflow
5. Build Permanent Internal Web
6. Print Shell + Web conventionally
7. Reduce Stage 8 support where the Web makes it unnecessary
8. Establish a repeatable ordinary Bambu print baseline
9. Lock conventional raft / retraction / material settings for the experiment
10. Begin FAB with small deterministic G-code variations
11. Compare baseline and variation prints physically
12. Expand FAB channels only from evidence
```

---

# Guardrails

Do not confuse these development layers:

```text
Artwork geometry
Permanent structural web
Temporary removable support
Conventional slicer profile
FAB expressive G-code variation
```

Each has a different responsibility.

Do not solve structural artwork problems only through FAB.

Do not use unstable G-code behavior to compensate for an invalid Permanent Web.

Do not modify multiple fabrication variables at once before a conventional baseline exists.

Do not add random variation as a substitute for authored or physically motivated variation.

Do not make FAB mandatory for opening, editing, or preserving SKIN artwork data.

---

# Guiding production principle

The intended progression is:

```text
First make it printable.
Then make the artwork support itself.
Then make ordinary printing repeatable.
Then deliberately disturb the material process.
```

The eventual objective is not merely a clean 3D print. It is a work in which authored form, permanent structure, support logic, and material deposition behavior can all become meaningful parts of the finished object.
