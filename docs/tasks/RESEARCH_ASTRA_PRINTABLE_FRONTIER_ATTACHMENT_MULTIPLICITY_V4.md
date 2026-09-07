# Research Astra — Printable Frontier + Attachment Multiplicity v4

Date: 2026-09-07
Owner: Research SOL
Research worker: Research Astra
Status: READY FOR RESEARCH

## Author decision / visual authority

The current v3 USAGI + botanical direction is visually accepted enough to preserve.

The next task is **not** another aesthetic search. It must keep the current visual atmosphere while addressing the remaining fabrication failure.

Read first:

- `docs/tasks/RESEARCH_ASTRA_MATERIAL_ANCESTRY_PRINTABILITY_FIX_V3.md`
- prior Research package `MATERIAL_ANCESTRY_PRINTABILITY_FIX_V3`
- `docs/observations/AUTHOR_OBSERVATION_SHAPE_ALGORITHM_BOTANICAL_CONTROL_2026-09-07.md`
- `docs/observations/AUTHOR_OBSERVATION_ATTACHMENT_MULTIPLICITY_REDUNDANCY_2026-09-07.md`
- current `docs/status/AB_CURRENT.md`
- current `docs/status/C_CURRENT.md`

Do not restart ABC exploration and do not invent a new motif family.

## Accepted / fixed artwork conditions

Preserve:

- exact authoritative A2 motif construction;
- uniform motif scale `0.5x` relative to the original A2 2000% reference;
- motif count `512`;
- current motif transforms / placement / orientation as the visual reference unless the new attachment-multiplicity rule itself requires relocation;
- current sparse volumetric density character;
- non-uniform / non-vertical branch directionality;
- USAGI host legibility;
- botanical / plant-like reading;
- multi-angle openness / interwoven Void ambition.

The v3 result already fixed material ancestry to one connected D1 body. Do not regress to disconnected motif groups.

## Current failure evidence

Use the v3 package as the baseline:

- D0 layer-island births: `45`;
- D0 Host-depth >= 2 mm births: `27`;
- D0 Bambu Support-OFF floating warning: still present;
- D1 positive solid components: `1`;
- 512 / 512 motifs have material ancestry;
- only a minority of new emergence paths satisfy the local printable-frontier condition;
- D3 still retains substantial Host-deep slicer Support dependence.

The next problem is therefore the **printable frontier itself**, not motif connectivity.

## Primary hypothesis

Reconstruct the Permanent growth order / branch selection so that printable state propagates through the artwork itself rather than being repaired mainly by later added members.

Target chain:

```text
bed / established Permanent region
        -> printable frontier
        -> volumetric branch growth / branch replacement / reconnection
        -> printable surface emergence
        -> motif attachment(s)
```

Prefer replacing / rerouting existing branch roles over simply accumulating more short repair members.

## Printable-frontier reconstruction scope

This task may change branch topology and growth ordering more deeply than v3, provided the visual authority is preserved and all changes remain deterministic / reproducible.

Allowed mechanisms:

- re-order branch growth so later members originate from actually established material;
- replace an unprintable branch with another candidate that serves a similar visual / volumetric role;
- reroute branches toward an established printable frontier;
- bounded anastomosis / cross-linking between existing branch systems;
- local junction relocation;
- bounded curvature changes;
- local radius adaptation only when manufacturing evidence requires it;
- surface-emergence relocation / timing changes when necessary for material continuity;
- motif-site relocation only when required by requested attachment multiplicity or printable ancestry.

Do not solve the problem by:

- broad densification;
- global thickening;
- near-vertical collapse;
- generic truss / lattice replacement;
- shell tracing;
- reducing motif count;
- approximating A2 motifs;
- arbitrary Blender-only hand fixes.

Report before / after member count, material budget, path length, radius distribution, orientation distribution, depth distribution, and multi-angle openness.

## New Research parameter — attachment multiplicity / redundancy

Introduce a Research-level integer parameter representing the requested material attachment multiplicity of a motif or motif cluster.

Suggested semantic name:

`attachmentMultiplicityTarget`

This is a **generator input**, not a post-process brace count and not yet a SKIN UI control.

Interpretation:

- low values preserve fragility / suspension / apparent floating quality;
- higher values require more materially independent support paths and may alter branch topology, anastomosis, motif eligibility, or motif placement;
- increasing the value must not mean duplicating the same branch several times after generation.

For each motif / cluster record at least:

- requested attachment multiplicity;
- visible / geometric attachment count;
- achieved materially independent attachment count;
- parent branch IDs;
- printable-frontier ancestry for each attachment;
- whether multiple attachments collapse into the same upstream bridge / articulation bottleneck;
- whether the requested target forced motif relocation, rejection, or branch-topology change.

Two visible branches that immediately merge into the same single weak root must not be reported as two independent supports.

Where practical, use graph-disjoint-path / bridge / articulation evidence to distinguish apparent multiplicity from independent redundancy. Do not equate graph redundancy with proven mechanical strength.

## Parameterization proof — bounded, not a full product sweep

Do not generate a large catalog of full-host variants in this task.

Instead, prove that `attachmentMultiplicityTarget` is a real generative parameter on a small diagnostic set of representative motif / cluster locations, including at least one upper / floating-looking region.

At minimum compare two requested values, e.g. `1` and a higher value such as `3`, and show that the higher target can change one or more of:

- motif-site eligibility / placement;
- parent branch selection;
- anastomosis / cross-link topology;
- independent material path count.

A higher target must not be demonstrated only by adding duplicated braces to an unchanged motif after the fact.

For the main v4 artwork candidate, preserve the current visual authority rather than globally forcing a high robust target on all 512 motifs.

## Artwork regimes to preserve for future SKIN translation

Record the parameter so future SKIN can support regimes such as:

```text
Competition / one-off:
  low attachment multiplicity, fragility / tension allowed with explicit warning

Product-art / robust:
  higher attachment multiplicity, more mutual support / redundancy, motif placement may move
```

Do not implement the Production UI in this task.

Keep this parameter distinct from the separate future artistic axis:

`HOST / SHAPE-LED <-> ALGORITHM / BOTANICAL-LED`

and distinct from hidden fabrication constraints such as minimum physical radius.

## D0 gate — Permanent Structure printability

D0 remains Permanent Structure only.

Re-run manufacturing evidence in the locked 1000% build orientation:

- positive-body connectivity;
- watertight / manifold / winding audit;
- layer-island / uncovered / recursive reachability diagnostics;
- overhang diagnostics;
- Bambu Studio Support-OFF inspection;
- floating-region warning status;
- explicit audit for inaccessible internal removable-Support dependence.

Moving to physical gate requires:

- no unresolved Bambu floating-regions warning under the documented inspection profile;
- no identified inaccessible internal removable-Support dependency for D0;
- any remaining abstract diagnostic island events reconciled with actual slicer behavior rather than ignored.

Do not call D0 printable from mesh validity or successful G-code generation alone.

If this cannot be achieved without materially degrading the approved visual direction, return `RESEARCH STRUCTURE FIX REQUIRED` rather than forcing a generic engineering solution.

## D1 gate — exact A2 motifs + material ancestry

D1 = revised D0 + exact A2 motifs, `0.5x`, count `512`.

Maintain:

- one materially connected artwork body unless an explicitly documented exception is approved;
- algorithmic ancestry;
- material ancestry;
- explicit attachment multiplicity metadata.

If motif placement changes because the requested multiplicity or printable ancestry cannot be achieved at the old site, preserve the causal rule and report the relocation rather than hiding it.

Required evidence:

- positive solid-component count;
- disconnected motif / cluster count;
- requested vs achieved attachment multiplicity distribution;
- independent-path / articulation diagnostics;
- front / oblique / reverse comparison against v3;
- multi-angle orbit / openness comparison;
- clear list of motifs / clusters whose placement or topology changed because of the new rule.

## D2 / D3 hierarchy remains active

Continue only after D0 / D1 decisions:

```text
D0 = Permanent Structure only
D1 = D0 + exact A2 motifs 0.5x / 512
D2 = D1 + residual authored Outside->Outside removable Support
D3 = D2 + residual slicer Support fallback
```

Use the same unsupported-demand analysis to decide what belongs in Permanent structure, authored removable Support, or slicer fallback.

Do not independently optimize Outside->Outside before the Permanent frontier stabilizes.

For D2:

- keep authored removable Support externally accessible / removable;
- distinguish bed-anchored vs body-anchored examples;
- preserve endpoint / target / gap / clearance semantics;
- record which residual demand each element addresses;
- do not route inaccessible removable Support through internal Void.

For D3:

- audit actual slicer Support path / volume / location including arcs;
- report Host-deep / potentially inaccessible Support fraction;
- warning disappearance alone is not PASS.

## Required artifacts

Produce Research artifacts immediately usable for Author review and Bambu inspection:

- separated `.blend` with at minimum `HOST_REF / VOID_GUIDES / PERMANENT_STRUCTURE / A2_MOTIFS / AUTHORED_REMOVABLE_SUPPORT`;
- D0 / D1 / D2 `.3mf`;
- D3 slicer-prepared comparison `.3mf` where feasible;
- D0 and D1 front / oblique / reverse renders;
- D1 multi-angle orbit / sheet;
- v3 vs v4 visual comparison;
- unsupported-demand maps;
- D3 Support-location / accessibility evidence;
- machine-readable printable-frontier ancestry;
- machine-readable attachment-multiplicity / independent-path data;
- Research parameters separating expression controls from fabrication constraints;
- manifest with hashes / provenance;
- exact Bambu profile / nozzle / material / orientation assumptions.

Blender manual edits must not become the sole geometry authority.

## Research SOL / Author review questions

1. Is the approved USAGI + botanical visual direction still present?
2. Did D0 become actually closer to a printable frontier without densification / verticalization?
3. Does D1 remain one materially connected artwork body?
4. Can attachment multiplicity be changed as a true generative input rather than a post-hoc brace count?
5. Does a higher multiplicity create genuinely independent material paths rather than one shared bottleneck?
6. How much motif placement / branching changes when higher robustness is requested?
7. How much residual demand remains for authored removable Support and slicer fallback?
8. Is the result ready for an Author physical gate?

## Outcome labels

Use only:

- `RESEARCH STRUCTURE FIX REQUIRED`
- `DIGITAL D0 PRINT PREFLIGHT PASS — PHYSICAL UNPROVEN`
- `RESEARCH FABRICATION SYSTEM READY — PHYSICAL UNPROVEN`
- `READY FOR AUTHOR PHYSICAL GATE`
- `PHYSICAL STRUCTURE PRINT PASS`
- `PHYSICAL SYSTEM PRINT PASS`
- `HOLD`

## HOLD / DO NOT DO

- no Production C / AB modification;
- no A2 baseline mutation;
- no Viewer expansion;
- no broad aesthetic exploration;
- no motif approximation / motif-count reduction;
- no global densification / thickening / verticalization shortcut;
- no generic support lattice;
- no false redundancy from duplicated branches sharing one bottleneck;
- no hidden manual Blender authority;
- no inaccessible internal authored removable Support;
- no Production UI / parameter implementation;
- no Production translation;
- no merge / deploy;
- no new Team creation.

STOP at the bounded Research package or Author physical-gate boundary and return evidence for Research SOL review.
