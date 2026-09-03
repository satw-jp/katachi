# FAB Direction Lock — 2026-09-03

## Status

This note records the current fabrication architecture decision after reviewing `agent/fab-material-span-1`.

The existing Material Span implementation is **not rejected**. It is retained as a useful experimental spike, but it is **not the entry point or mainline architecture of FAB**.

Reference checkpoint:

- Material Span branch: `agent/fab-material-span-1`
- frozen implementation checkpoint: `8bb53c8ffc20e36930a1a7e43200b9ccac39b684`
- older branch: `agent/skin-fabrication-span-0`
- do not continue FAB mainline work by extending the Material Span branch

## Main decision

FAB mainline starts **after ordinary slicing**.

```text
SKIN finished geometry
↓
Bambu Studio
↓
ordinary validated slicing
↓
ordinary Bambu G-code
↓
FAB import / analysis
↓
explicit, limited modulation
↓
modified G-code
↓
physical print / observation
```

FAB should first respect the printer/slicer workflow that already handles machine start/end, homing, calibration, purge, temperature, cooling, retraction, AMS-related behavior, and other machine-specific details.

FAB is therefore initially a **post-slicer fabrication modulation layer**, not a replacement slicer and not a general-purpose toolpath generator.

## FAB 0 first gate

The first FAB mainline milestone should be intentionally boring:

1. Import ordinary G-code exported from Bambu Studio.
2. Preserve the original source as authoritative input.
3. Parse enough structure to inspect moves and parameters without rewriting unrelated commands.
4. With all FAB modulation disabled, export the G-code **unchanged**.
5. Verify identity/pass-through behavior before adding artistic modulation.

Preferred invariant:

```text
FAB OFF
input G-code
=
output G-code
```

Where possible, preserve the original text/bytes exactly. If a later parser architecture requires normalization, the unchanged semantic program and every untouched command must still be demonstrably preserved; normalization must never be silently introduced as an artistic transformation.

## Mainline modulation order

After the pass-through gate is proven, add one explicit modulation family at a time.

Candidate order:

```text
Feed / F
↓
Extrusion / E
↓
Retraction behavior
↓
Timing / dwell / local motion rhythm
↓
other machine/material parameters only after dedicated validation
```

The goal is not random noise. Variation should be intentional, inspectable, reversible, and attributable to a specific FAB rule or authoring signal.

Do not reduce print reliability merely to make the output look irregular.

## Material Span position

`agent/fab-material-span-1` currently implements a different and later research question:

```text
two anchors
↓
FAB-authored straight free-air nozzle path
↓
feed × extrusion condition
↓
material crosses open air
↓
gravity / cooling / sag / contact / failure
↓
physical observation
```

This remains valuable as **FAB Experimental / Material Span Research**.

Keep the following ideas from that work:

- deterministic Feed × Extrusion sweep
- no random digital "naturalness"
- planned Intent separated from physical Observation
- do not digitally pre-author the final sag shape
- allow gravity, cooling, material flow, and accidental contact to remain physical phenomena
- keep production SKIN geometry separate until an explicit integration decision is made

The future relationship may become:

```text
SKIN Permanent Web edge
↓
structural / fabrication classification
↓
ordinary layered fabrication
or
experimental Material Span fabrication
```

That classification does **not** exist yet and must not be implied by the current spike.

## Boundaries

For FAB mainline v0:

- do not replace Bambu Studio slicing
- do not generate machine start/end sequences from scratch
- do not invent homing, purge, calibration, AMS, or shutdown behavior
- do not send directly to the printer as part of the first implementation gate
- do not merge Material Span semantics into production SKIN
- do not treat generated G-code as more authoritative than the imported ordinary Bambu G-code
- do not introduce random variation
- do not expand the scope into full non-planar or free-air printing before baseline post-processing is proven

## Branch-history note

`agent/fab-material-span-1` and `agent/skin-fabrication-span-0` diverged from a common ancestor rather than forming a clean sequential Span 0 → Span 1 history. Treat them as related research branches, not as a canonical linear FAB progression.

## Working model

Current intended ordering:

```text
1. SKIN printability and ordinary Bambu print baseline
2. FAB 0 — G-code import + identity pass-through
3. controlled post-slicer modulation
4. physical observation and parameter validation
5. later experimental fabrication modes
   └─ Material Span / free-air deposition
```

This ordering is the current FAB architecture lock until a later physical result gives a concrete reason to revise it.
