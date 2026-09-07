# Author Observation — Astra Physical Gate / Scale + Surface Balance

Date: 2026-09-07
Owner: Author / Research SOL
Status: AUTHOR PHYSICAL OBSERVATION / NEXT RESEARCH INPUT

## Physical gate context

The Astra v6 physical-print candidate was printed with:

- authored Astra Support;
- Bambu automatic Support OFF;
- raft only;
- Permanent internal members and Support trunks generated at the v6 physical-gate settings.

The print completed far enough to provide useful physical evidence. However, completion alone is not a full-system PASS: Support removal damaged multiple areas, and the Author does not accept the current visual balance as the next artwork baseline.

Physical photos are retained in the Drive folder `skin_astra_260907`.

## Author observations

### 1. Host / USAGI shape is not sufficiently legible

The first impression is that the USAGI host shape is difficult to read.

The current botanical / generated language is interesting, but at this scale and current surface/structure balance it dominates the host identity too strongly.

The next iteration should restore clearer macro-shape legibility without simply reverting to a smooth shell.

### 2. Scale

The current object feels too small and lacks physical presence.

For the next physical trial, the Author wants to investigate approximately **150% of the current physical size**.

The Author expects scale to have mixed fabrication effects:

- some members / local overhangs may become easier or more stable;
- other spans, rods, and unsupported regions may become less stable as their absolute lengths increase.

Therefore 150% is a physical experiment, not an assumption that uniform enlargement automatically improves printability.

### 3. Permanent internal structure vs removable Support hierarchy

The current Permanent internal structure and print Support are visually / structurally too similar.

The Author wants the Permanent internal structure to be **somewhat thicker than the removable print Support** so the distinction reads more clearly and the Permanent system has more structural authority.

The desired hierarchy is conceptually:

```text
Permanent internal structure  >  removable Support trunk  >>  thin sacrificial contact / neck
```

Do not collapse these roles into one common diameter by default.

### 4. Removal damage reveals a structural dependency

There are locations where collapse / weakness in the Permanent internal structure causes the outer/surface assembly to collapse as Support is removed.

Multiple areas were damaged during Support removal.

This suggests that the next Research step must consider not only print-time support demand but also **post-print removal load paths**:

- what remains stable after one Support is cut;
- whether Permanent structure carries the surface before neighboring Supports are removed;
- removal order and force direction;
- fragile motif / shell regions that should not become the load path during Support extraction.

A Support system that prints successfully but destroys the artwork during removal is not a successful fabrication system.

### 5. Shape / surface balance

The Author judges the current balance between overall shape and surface articulation to be weak.

A previous SKIN 3MF is retained as an important positive reference:

`katachi-skin-v086-a1mini-pla-020-119p5mm-print-candidate.3mf`

The attached / retained reference has a longest dimension of approximately 119 mm and remains visually balanced even at relatively small scale.

The Author specifically values that reference because:

> small motif islands and holes are distributed relatively uniformly across the surface.

The result is a useful separation of scales: fine surface activity does not erase the larger body reading.

## Candidate source recipe for the older reference

The Author supplied the Drive file:

`skin-recipe-2026-08-27T03-58-27-431Z.json`

as a **possible** source recipe for the older positive reference. Provenance is not yet confirmed, so do not silently treat it as exact authority until lineage is verified.

Inspection of that candidate recipe shows a useful comparison direction:

- surface preset: `dense-flower-v6-style`;
- surface generation mode: `randomPack`;
- motif placement: `surface`;
- patch shape: `flower`;
- 418 recorded patches;
- 25 points per patch;
- flower preset: `six-core`;
- substantial opening / hole character is encoded in the flower parameters;
- fine motif packing is distributed across the surface rather than concentrated only at a small number of growth-emergence regions.

Use these facts as comparative evidence only until source lineage is confirmed.

## Research interpretation — three-scale hierarchy

The current physical evidence suggests that future SKIN / Astra work should explicitly distinguish three perceptual scales:

```text
MACRO
Host / USAGI shape / silhouette

MESO
Permanent volumetric branch structure

MICRO
Surface motif islands + holes / perforation rhythm
```

The problem is not simply "more shape" or "more algorithm".

The Author wants all three, but with a controllable hierarchy.

The older positive reference suggests that **small, comparatively uniform surface motifs + distributed holes can preserve macro shape legibility**, while the Astra direction contributes stronger volumetric / botanical organization.

A promising synthesis is therefore not to discard Astra growth, but to combine:

- clearer host-scale form;
- volumetric botanical Permanent structure;
- finer / more evenly distributed surface motif-hole rhythm.

## Future SKIN parameterization implication

This observation strengthens the previously recorded `HOST / SHAPE-LED <-> ALGORITHM / BOTANICAL-LED` author control, but also shows that one macro slider will likely need decomposed controls underneath it.

Future Research should preserve independent parameters for at least:

- overall Host / artwork physical scale;
- host-shape / silhouette fidelity;
- Permanent structure diameter / hierarchy;
- removable Support trunk diameter;
- sacrificial contact diameter / length;
- motif absolute scale;
- motif density / surface coverage;
- motif spatial uniformity vs growth-history bias;
- hole / opening ratio and distribution;
- botanical growth / branching expression;
- post-print removal stability.

Do not automatically couple all dimensions under one global scaling operation if that destroys the Macro / Meso / Micro hierarchy.

## Next Research direction

Before another full physical print, use the v6 physical evidence and the older positive reference to build a bounded comparison around:

1. approximately 150% current overall size;
2. clearer USAGI macro-shape reading;
3. Permanent internal structure visibly / structurally thicker than removable Support;
4. finer, more uniformly distributed motif islands and holes inspired by the older positive reference;
5. Astra botanical / volumetric growth retained;
6. Support-removal stability evaluated as part of the fabrication system, not only print completion.

Do not revert to broad aesthetic exploration. The desired direction is a synthesis of the current Astra botanical system and the older SKIN surface-balance reference.

No Production C / AB / SKIN implementation is authorized by this observation alone.
