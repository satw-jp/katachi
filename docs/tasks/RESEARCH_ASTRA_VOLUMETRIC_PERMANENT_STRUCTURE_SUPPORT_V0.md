# Research Astra — Volumetric Permanent Structure / Support Convergence v0

Date: 2026-09-06
Owner: Research SOL
Research worker: Research Astra
Status: READY FOR RESEARCH

## Why this research now

The author’s current physical evidence suggests that Team A/AB and Team C have converged on the same deeper problem.

C proved that a surface-biased Permanent Structure can print and that the authored removable Support can be easy to remove, but the result does not yet use the interior volume strongly enough.

A2 is visually promising because its fine motif density and irregularity feel computationally specific and difficult to reproduce manually or with a straightforward Grasshopper workflow, but it is also not strongly volumetric and currently requires very expensive supplementary Bambu Tree Support generation.

A second author concern is now explicit: current motif placement can be visually irregular without having a strong geometric reason for why a motif appears at one surface location rather than another. The desired direction is for motif placement to become a consequence of the Host geometry and the growth history, not a mechanically random surface scatter.

The next research question is therefore not simply "how to improve temporary Support".

It is:

> How can the Permanent Structure itself become a genuinely volumetric, computationally specific, Host-derived, print-causal internal web that simultaneously contributes to the artwork, carries enough load during printing that temporary slicer Support can be greatly reduced or ultimately eliminated, and gives motif placement a causal reason?

Read first:

- `docs/observations/AUTHOR_OBSERVATION_VOLUMETRIC_INTERNAL_STRUCTURE_2026-09-06.md`
- `docs/observations/AUTHOR_OBSERVATION_HOST_DERIVED_MOTIF_CAUSALITY_2026-09-07.md`
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/VIEWER_CURRENT.md`
- `docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md` if available

## Core clarification

Do not inherit the current Removable Support constraint `Outside-only / Outside -> Outside` as an unquestioned requirement for the future Permanent Structure.

That constraint is appropriate for a removable fabrication scaffold that must not become internal rescue geometry.

A Permanent Structure is artwork material and may remain inside the volume. Research should therefore examine architectures where interior members intentionally remain and where those members can provide print-time support/load paths as part of the final work.

This does **not** authorize arbitrary internal filling. The target is a sparse three-dimensional web, not a solid core.

Likewise, do not treat motif placement as an unrelated downstream random scatter. Research should test whether the same Host-derived internal organization that creates the Permanent Structure can also condition where motifs emerge on the surface.

## Research objectives

Investigate principles / representations / algorithms that could produce a Permanent Structure with all of the following qualities:

1. **Volumetric occupation**
   - members traverse the interior rather than clustering in a surface band;
   - multiple penetration depths are present;
   - distant regions connect through the volume;
   - foreground / middle-depth / deep structure are visually legible.

2. **Computational specificity**
   - retain the quality seen in A2 where fine motifs and irregular relationships appear difficult to reconstruct by hand or by a simple deterministic GH recipe;
   - avoid collapsing into a generic lattice, truss, Voronoi foam, or obvious engineering scaffold unless such structures are materially transformed by the generative process.

3. **Host-derived causal organization**
   - investigate representations that can read an internal organization from the Host: medial / skeletal graph, thickness structure, distance-field ridges, transport/diffusion fields, geodesic relationships, or combinations;
   - the internal network should feel derived from the Host without becoming a literal copied medial-axis tree;
   - multiple sources, cross-links, anastomosis, lateral growth, and loops are encouraged where they prevent a conventional trunk/branch/leaf reading.

4. **Causal motif emergence**
   - motif locations should inherit a reason from Host geometry / internal graph / field / growth history;
   - preferred story: Host -> internal organization -> permanent branches -> surface emergence / approach -> motifs bloom;
   - the final surface distribution may still look irregular or almost random from outside, but the irregularity should be emergent rather than the primary rule;
   - randomness may be bounded variation or a tie-breaker, not the main explanation for placement.

5. **Print-causal permanence**
   - the permanent graph should preferentially create valid lower-to-higher load/support paths during additive fabrication;
   - explore whether already-printable permanent members can become anchors for later permanent members;
   - support relationships may pass through the interior because they remain as artwork;
   - distinguish permanent print-causal structure from removable Support.

6. **Void preservation**
   - preserve continuous air / sight-lines;
   - avoid a congested central mass;
   - let Solid and Void both have spatial depth;
   - consider whether Void continuity / bottlenecks / retained-air shape can guide graph growth.

7. **Structural redundancy / durability**
   - reduce single-attachment appendages and bridge/articulation fragility where possible;
   - investigate loops, alternative paths, multi-attachment regions, and load-distribution principles without turning the work into a conventional optimized truss.

8. **Support reduction as a consequence, not sole objective**
   - the final ambition is to remove Bambu-generated supplementary Support if possible;
   - however, do not sacrifice the artwork merely to reach zero-support immediately;
   - the author accepts a final print gate and some rough contact surfaces during development.

## Questions Astra should answer

At minimum, compare several distinct conceptual families rather than proposing only one implementation:

- interior growth from currently printable permanent regions;
- build-direction-aware graph growth / layer-causal graph construction;
- transport-network or flow-network models adapted to three-dimensional interior occupation;
- medial / interior field-guided graph placement;
- redundancy / anastomosis / loop formation as both spatial and structural behavior;
- support-demand-aware permanent-member insertion;
- Void-aware growth that increases internal depth while protecting continuous air paths;
- graph/field co-design where printability emerges from the same permanent network rather than from a later temporary scaffold;
- Host-derived skeleton / medial / field models where surface motif sites emerge from graph-to-surface events rather than from random scatter;
- multi-source growth with surface competition / inhibition so the result does not read as a literal botanical tree.

For each family, discuss:

- what representation it needs (Graph / Field / Volume / State / History / combination);
- whether it naturally produces genuinely 3D internal structure;
- whether it can preserve A-like computational specificity;
- whether it can make motif placement causally Host-derived while still looking irregular;
- whether it can be made print-causal;
- risk of central congestion / generic lattice appearance / botanical tree appearance / over-optimization;
- likely computational cost and whether incremental/local updates are possible;
- whether it is more appropriate for AB exploration first or C production translation later.

## USAGI as a diagnostic Host

Use USAGI as one conceptual test Host where helpful, because the author specifically wants to examine whether a recognizable geometry can produce a meaningful internal organization before motif placement.

Do not assume a single literal skeleton is correct. Compare alternatives such as medial structure, local-thickness organization, distance-field ridges, transport fields, or hybrid graph/field representations.

The desired result is not a rabbit-shaped tree. The external motifs should still read as a dense irregular covering similar in spirit to the current work, while their positions remain explainable through the hidden Host-derived network history.

## Relationship to A / G / H / J

Do not assume G/H/J must be executed as currently defined.

A2 physical review comes first. After that:

- if A2 already suggests a useful permanent-structure principle, this research may help translate it directly toward C;
- if A2 remains too shallow volumetrically, use this research to reinterpret which of G/H/J — if any — actually test stronger interior occupation or stronger causal organization;
- do not preserve the old candidate list merely for completeness.

## Relationship to C

Do not modify C Production in this research task.

C remains the current fabrication baseline. Research should produce translation candidates that C SOL can later scope as separate bounded tasks.

The existing C physical PASS remains valid for the tested near-vertical regime.

## Relationship to removable Support

Current authored removable Support remains a useful fabrication layer and was reported by the author as easy to remove in C.

Research should therefore distinguish three levels:

1. Permanent Structure carries most of the final geometry and some/most print load.
2. Authored removable Support handles residual cases where permanent structure should not be added.
3. Bambu/slicer-generated Support is the last fallback and should trend toward zero over time.

Do not assume level 2 must become zero before level 3 can be reduced.

## Deliverable

Return a compact Research SOL review package containing:

1. a one-page problem restatement;
2. 4-7 distinct candidate principle families;
3. a comparison table across volumetric depth / computational specificity / Host-derived motif causality / print-causality / Void preservation / durability / compute cost / translation fit;
4. 1-3 recommended experiments, each deliberately small and diagnostic rather than a production rewrite;
5. explicit notes on what should be tested first after A2 physical observation;
6. at least one USAGI-oriented causal-placement thought experiment;
7. clear separation between scientific inspiration, computational analogy, and project claim.

No production implementation in this task.
No automatic expansion into a large research program.
STOP for Research SOL review after the package is complete.
