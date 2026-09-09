# Astra — SKIN Research Roadmap Evaluation

Date: 2026-09-08
Owner: Astra / Research review
Status: RESEARCH ROADMAP EVALUATION — NO IMPLEMENTATION AUTHORIZED

## Source basis

This evaluation was made against `satw-jp/katachi` main at:

`886ec500c27552c30fbb027fdeb5cdb3a6cca571`

Reviewed authority included:

- `docs/TEAM_PROTOCOL_CORE.md`
- `docs/status/SKIN_R_CURRENT.md`
- `docs/status/SKIN_ABC_CURRENT.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX1.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_ARTWORK_FABRICATION_TOOLPATH_ARCHITECTURE_2026-09-08.md`
- `docs/notes/SKIN_FUWAFUWA_NEXT_SHAPE_CANDIDATES_2026-09-08.md`
- relevant Astra v6 / Dual Physical / D1-D2 records
- Drive Research handoff `RESEARCH_HANDOFF_2026_09_08_PHYSICAL_PROGRESS`

This note preserves the Astra roadmap evaluation. It is **not** a task, implementation approval, Production handoff, print instruction, or geometry-generation request.

## Executive judgment

The proposed roadmap is directionally sound, but it should **not be treated as a completely serial pipeline**.

Astra recommended three changes:

1. overlap the current four-candidate physical evaluation with actual use of the Reader;
2. do not make a finished Authoring UI a prerequisite for starting Mocomoco research;
3. separate bounded SKIN reproducibility from later topology/generalization claims.

The preferred research progression is therefore:

```text
Reader v0 closure ───────┐
                         ├─ current four-candidate physical observation
Physical evaluation ────┘
             ↓
physical object ↔ geometry identity ↔ author intent
             ↓
Mocomoco exact source freeze
             ↓
feedback-method research
             ↓
Mocomoco artwork refinement
             ↓
Torus generalization / stress test
             ↓
selective SKIN / Production translation
```

## A–C. Recommended phases, questions, and exit gates

| Phase | Timing | Research question | Exit gate |
|---|---|---|---|
| 0. Reader v0 closure | **DO NOW** | Can the Author select a real branch and distinguish recorded history from Reader-side derivation? | Fix 1 synchronization, provenance semantics, minimal asset boundary, and Browser evidence are reviewed; then Author can relate at least part of a physical object to the Reader view. |
| 1. Current four-candidate physical evaluation | **DO NOW** | Which relationships are worth preserving as artwork, and where do print-time failure and Support-removal breakage differ? | For all four candidates, record physical outcome and Author judgment; distinguish unprinted, removal-damaged, healthy, and unassessable regions. Perfect success is not required. |
| 2. Physical ↔ Reader correspondence | **DO NOW / NEXT**, overlapping Phase 1 | Can “this is the part I want changed” be received as the same geometry identity by another system/person? | Target ID, artwork revision, view, requested change, and protected relation can be communicated; uncertainty stays explicit. Only actually missing operations are collected. |
| 3. Mocomoco exact source selection / freeze | **NEXT** | Is the chosen FUWAFUWA Mocomoco both a work candidate and a useful feedback-learning shape? | Author selects existing source and fixes path, hash, scale, orientation, visual reference, and any approved source edit. |
| 4a. Mocomoco feedback-method study | **NEXT** | Does an Author physical judgment return as the intended local geometry difference? | A frozen baseline supports: identify target → confirm intent → produce explicit delta → inspect physically again. Feedback accuracy is evaluated separately from artwork quality. |
| 4b. Mocomoco artwork-quality refinement | **LATER** | Can SHAPE / MOTIF remain primary while Structure / Void / durability improve without visually taking over? | Author judges whether the work is worth continuing; D0 and fabrication differences remain separable; benefits and costs of changes can be described; endless tuning is avoided. |
| 5–6. Torus selection and generalization probe | **LATER** | Do the learned structure, feedback, Void, and fabrication principles survive a strong opening / wraparound topology? | Record valid domain, failure conditions, and shape-specific exceptions. A diagnosed failure can be a successful Research result. |
| 7. Selective SKIN reproducibility / Production translation | **LATER** | Which capabilities are worth repeated author use? | `SKIN_ABC_SOL` chooses a bounded capability and responsibility boundary. Reproduce/save/reopen/output/Author acceptance are checked separately from generalization. |

## Four-candidate gate before Mocomoco

Mocomoco source selection and Reader learning do **not** need to wait for perfect completion of the current four candidates.

However, before beginning a new Mocomoco physical iteration, Astra recommends one bounded closure pass across:

- `B_OPEN`
- `B_PARTICIPATING`
- `A_OPEN`
- `A_PARTICIPATING`

For each candidate preserve:

- exact Artwork / D1 / D2 / toolpath / profile actually used;
- regions that failed during printing;
- regions that printed and then broke during Support removal;
- healthy regions;
- Author judgment of internal openness, branch presence, surface retention, and overall value;
- items that could not be judged;
- explicit decision to close the present generation-quality study even if some uncertainty remains.

Do **not** convert “not assessable” into a positive result.

A retry may be justified for a particular candidate, but the whole four-candidate phase should not return to indefinite optimization.

Because fabrication conditions evolved across candidates, OPEN / PARTICIPATING physical differences must not be claimed as pure graph-causality evidence without accounting for D1, Support, profile, and removal conditions.

## Reader → Authoring minimum gate

Authoring should begin only when a concrete Author decision cannot be handled by reading/annotation alone.

Minimum conditions:

1. **Reader explanations are trustworthy.**
   `RECORDED / DERIVED / NOT RECORDED` must be semantically correct.
2. **Physical object and revisioned geometry identity can be related.**
   A missing/broken branch may be located through photo/view/neighbor motifs, but uncertainty must remain visible.
3. **A specific operation need exists.**
   Example: “increase only the hidden attachment behind this large motif.”
4. **The change can be represented as an explicit reversible delta.**
   Distinguish an artwork D0 revision from Fabrication D1.

The first useful capability may be **recording intent against a selected geometry identity**, not necessarily branch add/delete.

Astra explicitly recommends avoiding a speculative full Authoring toolbox before the Reader reveals what the Author actually needs.

## Mocomoco — feedback-method success criteria

Mocomoco is valuable because it can teach the loop itself:

```text
physical observation
    ↓
identify geometry
    ↓
communicate author intent
    ↓
explicit local delta
    ↓
new physical observation
```

Feedback-method success is separate from artwork success.

Examples:

- **“Reinforce only behind this large flower.”**
  Success means the intended motif / attachment / branch is identified and the visible-region character is protected.
- **“Keep this Void.”**
  Success requires communicating both what may change and what spatial corridor / sight-line must remain unchanged.
- **“Make this branch more volumetric / spatial.”**
  The system must not silently define “more spatial”; view and direction should be used to confirm the Author’s intent.

Further useful evidence:

- the same location can be recovered later;
- an Astra interpretation error can be corrected by the Author;
- target identity and intent can be preserved across revisions.

A feedback loop can PASS even when the resulting design is rejected by the Author. Accurate communication and artwork improvement are different gates.

## Mocomoco — method study and artwork study

Both can occur on one work, but not as one undifferentiated success claim.

Recommended separation:

### 4a — feedback method

Freeze baseline and evaluate whether the Author’s intended target / constraint / delta is transmitted accurately.

### 4b — artwork quality

Only after the intent is understood, judge whether the resulting SHAPE / MOTIF / Structure / Void relationship is better.

If tooling is inadequate, return to 4a. Do not simultaneously change generator, motifs, Support, and evaluation rules.

Also, do not assume the selected Mocomoco is simple merely because it is roughly sphere-like. The exact FUWAFUWA source may contain deep concavity, narrow necks, or other local difficulties. Scope after source selection.

## Torus — why later

Astra agrees with placing Torus after Mocomoco.

Starting Torus too early would make it difficult to distinguish:

- failure of Author feedback;
- limitation of the Structure generator;
- Void / topology issue;
- fabrication / Support issue;
- source / coordinate / scale problem.

Torus should begin only when the system can at least diagnose its own failure.

Before Torus physical research, have:

- exact source / scale / orientation authority;
- physical ↔ ID ↔ revision correspondence;
- D0 / D1 / D2 readable as separate states;
- reversible local-delta recording, even if this is not yet a full UI;
- explicit Host material region, central opening, protected Void, and removal path concepts;
- multiple viewpoints for central opening / backside / wraparound openness.

Important distinction:

> The central opening being geometrically outside the Host is not proof that a removable Support route is accessible or removable through it.

Existing intersection-zero evidence must not be promoted to removal-access proof.

## Internal Structure generator freeze

Astra recommends two related freezes:

### Current four candidate artwork

Keep the current artwork generation state fixed during evaluation. Required physical corrections should remain explicit D1 / D2 / toolpath differences.

### Research baseline generator

Keep the present generator as the baseline through:

- current four-candidate evaluation;
- first Mocomoco baseline;
- initial Mocomoco feedback-method study.

This does **not** mean that the current 96 junctions / 95 OPEN core edges are universal laws. They are historical/current generator output and comparison authority.

## Trigger for new branch-generator research

Do not restart generator research merely because of one print warning, one low-region failure, or one broken branch.

Stronger triggers include:

- the Author repeatedly requests the same spatial relation on multiple concrete examples and local deltas cannot achieve it;
- adding necessary surface connection repeatedly destroys an important Void / sight-line because of the current generator’s structural tradeoff;
- D1 repeatedly changes the artwork substantially, showing fabrication adaptation is compensating for an unsuitable D0 structure;
- Torus exhibits repeated failures of the same class after source, coordinates, Support, and toolpath causes have been excluded.

Current B_OPEN physical evidence — successfully printed regions surviving careful removal reasonably well — does not by itself justify replacing the entire generator.

## Research vs SKIN_ABC / Production responsibility

Recommended boundary:

### Astra Research / SKIN_R

Own discovery and evidence:

- identify what works;
- preserve source / parameters / history;
- classify limits and exceptions;
- connect physical observation to geometry identity;
- produce reproducible deltas / evidence;
- distinguish artwork, fabrication, and toolpath causality.

### SKIN_ABC / Production

Own selected durable capability:

- decide which Research result is worth productizing;
- save / reopen / compatibility;
- output reliability;
- performance;
- interaction quality;
- maintenance;
- compatibility with existing Production semantics;
- bounded Author acceptance.

Research success does not automatically authorize Production translation.

Keep these levels distinct:

1. `R reproducible`
2. `SKIN reproducible`
3. `Generalizable`

A bounded SKIN reproduction may happen before Torus. A general claim about generator / fabrication behavior across topologies should wait for later probes such as Torus.

## D. Do not do now

### DEFER

- pre-building branch add/delete, junction movement, and a full Authoring toolbox;
- a new branch generator;
- Mocomoco/Torus generation before exact FUWAFUWA source selection;
- common kernel / AB-C merge / global Support unification;
- forcing the second USAGI to be SKIN-produced before current Reader / physical evidence is ready.

### DROP as present completion criteria

- requiring every diagnostic to reach zero;
- requiring all four candidates to print perfectly;
- copying B_OPEN’s exact branches / coordinates / Support as general rules;
- globally thickening all internal branches;
- treating inferred history as recorded history.

## E. Main ordering changes from the first roadmap draft

1. **Overlap physical evaluation and Reader use.**
   B_OPEN already exists physically, so use it to test correspondence as soon as Reader Fix 1 is accepted.
2. **Separate source selection from new physical iteration.**
   The Author can choose/freeze Mocomoco before the current four-candidate study is entirely finished, while actual new-work iteration waits for a bounded closure.
3. **Do not require a complete Authoring UI for Mocomoco.**
   Reader-selected IDs plus an explicit Astra delta are enough to begin feedback-method research.
4. **Split selective reproduction from generalization.**
   A useful local-history or selection capability need not wait for Torus; generic generator claims should.

## F. Largest Research risks

1. **DO NOW — learning from incorrect identity or invented history.**
   Mitigation: provenance semantics plus physical / revision / ID correspondence.
2. **DO NOW — confusing artwork differences with fabrication differences.**
   Mitigation: preserve D0, D1, D2, toolpath, profile, and removal condition separately.
3. **NEXT — confusing successful interaction with successful artwork.**
   Mitigation: separate feedback-method gate and Author artwork gate.
4. **NEXT — current four-candidate polishing never ends.**
   Mitigation: allow explicit unresolved outcomes and close the phase without perfect success.
5. **LATER — treating Mocomoco-specific success as general principle.**
   Mitigation: selective SKIN reproduction may proceed, but generalization waits for Torus / later topology evidence.

## Priority conclusion

The next learning priority is **not** a more sophisticated branch generator.

It is to make physical observation addressable:

```text
physical work
    ↕
geometry identity / provenance
    ↕
Author intent
    ↕
explicit reversible difference
```

Then use Mocomoco to learn and refine this feedback loop, and Torus later to test where the principles stop working.

No implementation, geometry generation, slicing, G-code generation, printing, or new task is authorized by this roadmap evaluation.
