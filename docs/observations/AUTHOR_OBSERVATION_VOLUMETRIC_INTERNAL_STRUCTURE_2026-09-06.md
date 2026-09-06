# Author Observation — Volumetric Internal Structure

Date: 2026-09-06
Owner: Author / Overall SOL
Status: CROSS-LANE AUTHOR CRITERION

## Observation

The successful C physical print demonstrated that the current structure can print and survive support removal, but the Permanent Structure reads as too surface-biased / shallow in the volume.

The artwork can therefore become physically valid without yet using the interior space strongly enough.

This changes the artistic evaluation criterion for the next AB / C / Research / Viewer decisions.

A2 adds a second, distinct author criterion. Its form is not volumetric, but the very fine motif density / irregularity is attractive because it does not look easy to reproduce by hand or by a straightforward Grasshopper-style construction. This computational specificity should be preserved even if later structure becomes more volumetric.

Taken together, A and C now appear to share one deeper problem: the Permanent Structure itself should become a more genuinely three-dimensional internal web, and that same permanent web should increasingly carry print-time support/load-path responsibility instead of relying on a large independent temporary scaffold.

## Desired direction

The target is closer to a **three-dimensional spider-web inside the volume** than a network that mainly follows or reinforces the outer surface.

Desired qualities:

- structure enters and traverses the interior, not only the surface band;
- distant surface regions are connected through the volume;
- branches / nodes occur at multiple penetration depths;
- foreground / middle-depth / deep structure become legible from changing viewpoints;
- loops, cross-links, and alternative paths create genuinely volumetric continuity;
- the center must not collapse into a dense solid core;
- Void / sight-line continuity must remain present;
- Solid and Void should both have spatial depth;
- retain the fine, irregular, computationally specific motif quality seen in A2 rather than simplifying into something that looks manually constructible;
- where possible, permanent members should form useful lower-to-higher print-causal load paths so support function becomes part of the final artwork rather than a separate disposable structure.

Short formulation:

> Not a web supporting the outer shape, but a web crossing through the air-volume inside the shape — while keeping the fine computational specificity that is difficult to reproduce manually and allowing the permanent web itself to carry more of the printing logic.

## Evaluation consequence

For upcoming physical / visual reviews, "prints successfully" is necessary but not sufficient.

Add the following author questions:

1. Does the network materially occupy the interior volume?
2. Does it create depth rather than mainly surface coverage?
3. Are there meaningful through-volume connections between distant regions?
4. Does the structure remain porous enough that continuous air / sight-lines survive?
5. Does the result avoid both extremes: a superficial shell-network and a congested central mass?
6. Does the form retain a level of fine irregularity / motif complexity that feels computationally specific rather than easily hand- or GH-constructed?
7. Does the Permanent Structure itself reduce unsupported/floating conditions by providing useful print-causal paths, rather than merely adding independent temporary Support afterward?

## Fabrication / support consequence

C physical handling showed that the current authored removable Support was very easy to remove.

The author is also comfortable with some roughness on supported print surfaces. A perfectly clean support-contact finish is therefore not a primary artwork requirement.

The long-term ambition is to eliminate Bambu/slicer-generated supplementary Support if possible, but this is not an immediate hard gate. The preferred progression is:

1. **Permanent Structure** carries the artwork and an increasing share of print-time support/load paths.
2. **Authored removable Support** handles residual cases where adding permanent artwork structure would be undesirable.
3. **Bambu/slicer-generated Support** remains the last fallback and should trend toward zero over time.

Consequences:

- do not inherit `Outside-only / Outside -> Outside` removable-Support constraints as unquestioned rules for future Permanent Structure; permanent artwork material may intentionally remain inside the volume;
- do not make "fully self-supporting with no final print gate" an immediate primary design goal;
- a final slicer / physical print gate may remain if it preserves greater geometric freedom;
- do not sacrifice volumetric occupation or computational specificity merely to eliminate all supplementary Support in one step;
- authored removable Support should remain removable, non-destructive to important form, and reasonably reviewable before print;
- supplementary slicer Support is acceptable as fabrication assistance when explicitly recorded, but it must not be mistaken for proof that authored SKIN Support alone is sufficient;
- Bambu Studio supplementary Support generation currently has a very high time cost on A2, so total iteration time must consider slicer-support generation as well as AB/SKIN compute time;
- future optimization should ask whether unsupported regions can instead become permanently connected into the volumetric artwork before adding more temporary Support.

This shifts the optimization target from "remove every print gate" toward "move as much support responsibility as is artistically appropriate into the Permanent Structure, keep a manageable authored removable fallback, and reduce expensive slicer fallback over time."

## AB consequence

A2 physical print should be reviewed against both the volumetric criterion and the computational-specificity criterion before deciding whether G / H / J are worth running.

- A2 is currently promising for fine motif density / computational specificity but not for volumetric occupation.
- If later A-derived development can preserve that fine motif quality while adding convincing interior / through-volume structure, its useful principle may be translated into C without requiring completion of all G / H / J candidates.
- If A2 remains surface-biased, do not run G / H / J mechanically. First re-read their intended structural differences and keep only candidates that plausibly test stronger volumetric occupation or another clearly valuable structural axis.
- Do not call A2 a "winner" without the equal-condition comparison if G / H / J are skipped. It may instead be selected as the next adopted direction for practice.
- Performance work after the A2 physical gate should consider end-to-end iteration cost: Candidate / authored Support / export / Bambu supplementary Support generation / slice, not only Full Sparse Support runtime.
- A future A-derived structure should test whether permanent internal links can turn current floating/overhanging motif regions into part of a self-carrying volumetric artwork before increasing removable or slicer Support.

## C consequence

Do not reopen locked C Production semantics merely because the first print is volumetrically shallow.

Treat this as a new artwork / structure criterion for a later bounded translation or structure task after AB physical evidence is reviewed.

Existing C physical PASS remains valid as fabrication evidence for the tested shape regime.

C support-removal evidence is positive: authored removable Support was easy to remove. Future structure work therefore does not need to contort itself toward zero-support printing if a bounded print gate remains acceptable.

The deeper C question is now the same as AB's: can Permanent Structure move inward, gain redundancy and print-causal connectivity, and thereby reduce the amount of separate temporary support without becoming a dense generic engineering lattice?

## Viewer consequence

Viewer v0 is already technically closed and waiting on Author Review.

Use Graph / Surface / Void to ask whether the current C artifact reveals the same surface-bias and whether Void can make interior depth / retained air legible.

Do not add new Viewer metrics before the Author Review.

## Research consequence

This observation now authorizes a bounded new Research SOL / Astra question focused on the shared AB/C problem.

Research brief:

`docs/tasks/RESEARCH_ASTRA_VOLUMETRIC_PERMANENT_STRUCTURE_SUPPORT_V0.md`

Relevant research questions include:

- representation of penetration depth / interior occupancy;
- through-volume graph connectivity;
- relation between transport redundancy and spatial depth;
- Void continuity / bottleneck / sight-line under stronger internal structure;
- how to increase volumetric structure without producing central congestion;
- how to preserve computationally specific fine motif complexity while moving the structure deeper into the volume;
- build-direction-aware / layer-causal permanent graph growth;
- how permanent internal members can absorb support/load-path roles that would otherwise be temporary;
- how fabrication constraints can remain a bounded final gate rather than dominate the generative geometry.

## Routing

Relevant lanes:

- Overall SOL
- Team AB / SKIN SOL
- Team C SOL
- Research SOL / Astra
- FKEI Viewer SOL

This file is an author observation / cross-lane criterion, not an implementation task. Each Team SOL decides whether and when it should produce a bounded implementation or research instruction.
