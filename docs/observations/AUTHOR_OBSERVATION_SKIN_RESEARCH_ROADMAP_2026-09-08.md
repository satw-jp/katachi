# Author Observation — SKIN Research Roadmap after Astra Review

Date: 2026-09-08
Owner: Author / Research SOL
Status: ADOPTED RESEARCH ROADMAP — NOT ACTIVE IMPLEMENTATION

## Purpose

This note records the Author / Research SOL interpretation adopted after reviewing the Astra roadmap evaluation:

- `docs/notes/ASTRA_SKIN_RESEARCH_ROADMAP_EVALUATION_2026-09-08.md`

It should be read together with:

- `docs/status/SKIN_R_CURRENT.md`
- `docs/status/SKIN_ABC_CURRENT.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_ARTWORK_FABRICATION_TOOLPATH_ARCHITECTURE_2026-09-08.md`
- `docs/notes/SKIN_FUWAFUWA_NEXT_SHAPE_CANDIDATES_2026-09-08.md`

This is a roadmap observation only. It does **not** start a new implementation task, generator study, Production translation, slicing run, G-code generation, or print operation.

## Adopted direction

The Research sequence is **not a fully serial pipeline**.

The adopted correction is:

1. close the current SKIN_R Reader v0 correctly;
2. continue the current four-candidate physical evaluation at the same time;
3. use completed physical work to test physical-object ↔ geometry identity correspondence as soon as the Reader is trustworthy;
4. do not pre-build a complete Authoring UI before knowing what operations the Author actually needs;
5. use Mocomoco as the next feedback-learning artwork after the present generation-quality study is bounded;
6. use Torus later as a topology / Void / fabrication generalization probe;
7. translate only selected proven capabilities into SKIN_ABC / Production.

## Near-term path

```text
NOW
│
├─ SKIN_R Reader Fix 1 / v0 acceptance
│
└─ current four-candidate physical evaluation
        │
        └─ use completed physical works with Reader
             ↓
        identify the operations that text alone cannot express

NEXT
│
├─ close the current four-candidate generation-quality phase
│
├─ Author selects exact FUWAFUWA Mocomoco source
│
└─ freeze source identity / scale / orientation / visual reference
        ↓
    physical observation
        ↓
    Reader identifies geometry
        ↓
    Author communicates intent + protected relation
        ↓
    Astra produces an explicit reversible delta
        ↓
    physical observation again
```

## Current four-candidate closure

Current candidates remain:

- `B_OPEN`
- `B_PARTICIPATING`
- `A_OPEN`
- `A_PARTICIPATING`

The goal is to evaluate all four physically and then **close the current generation-quality study as one bounded phase**.

Closure does not require:

- every candidate to print perfectly;
- every diagnostic to reach zero;
- every uncertainty to be eliminated.

For each candidate, preserve enough evidence to distinguish:

- what Artwork D0 / Fabrication D1 / removable Support D2 / toolpath / profile was actually used;
- print-time failure;
- breakage during Support removal;
- healthy surviving regions;
- Author judgment of internal openness, branch presence, surface retention, and overall value;
- items that remain unassessable.

A failed or unassessable physical region should remain failed / unassessable rather than being silently promoted into positive evidence.

The current artwork should not be reopened into broad generator exploration merely to make the four-candidate phase cosmetically complete.

## Reader as the bridge from physical object to computation

The key immediate value of SKIN_R is not editing. It is making the physical object addressable.

Desired relation:

```text
physical object
    ↕
geometry identity / revision
    ↕
recorded / derived provenance
    ↕
Author observation / intent
```

A useful Reader should let the Author point to a real region and establish which branch / junction / motif / attachment is under discussion without inventing missing historical reasons.

This is why `RECORDED / DERIVED / NOT RECORDED` remains a hard semantic requirement.

## Authoring should emerge from actual use

Do not decide the complete Authoring feature set in advance.

Possible future operations include:

- local radius edit;
- branch add/delete;
- attachment edit;
- junction movement;
- intent / constraint annotation.

But the first useful operation may be much smaller than any of these.

If the Reader can identify a target and preserve the Author’s intent, Astra can initially produce an explicit delta without a finished editing UI.

Example:

```text
selected motif / attachment / branch
+ "reinforce only behind this flower"
+ "keep this visible Void / sight-line"
→ explicit reversible geometry delta
```

If the same operation is repeatedly needed, then it becomes evidence for promotion into SKIN Authoring.

The intended principle is:

> **Do not invent the Authoring UI first. Promote operations that repeatedly prove necessary in actual physical feedback.**

## Mocomoco — next feedback-learning artwork

Mocomoco is not simply the next shape.

It is intended as a comparatively understandable artwork domain for learning how the Author communicates spatial judgment back into the computational system.

The exact source must come from an existing FUWAFUWA shape chosen by the Author.

Before new Mocomoco physical research, freeze:

- source path / artifact;
- hash / identity;
- scale;
- orientation;
- visual reference;
- any explicit Author-approved source edit.

Do not generate a substitute Mocomoco from scratch.

### Mocomoco feedback gate

The main loop is:

```text
physical observation
→ identify target geometry
→ communicate Author intent
→ produce explicit local difference
→ inspect resulting physical object
```

Examples:

- “reinforce only behind this large flower”;
- “keep this Void / sight-line”;
- “make this branch more spatial / volumetric.”

For phrases such as “more spatial,” the system must not invent a numeric meaning without confirming direction / view / intended relation.

### Separate feedback success from artwork success

Two gates must remain distinct.

**Feedback Gate**

Did the Author’s target and intent survive the round trip accurately?

**Artwork Gate**

Did the resulting change actually improve the work?

Therefore:

> A change can be correctly understood and still be artistically rejected.

That is a feedback-method PASS and an artwork-quality FAIL, not a contradiction.

## Mocomoco and Authoring

A complete SKIN Authoring implementation is **not** a prerequisite for starting Mocomoco feedback research.

A minimal working loop can initially use:

- Reader-selected geometry identity;
- Author text / view / protected relation;
- Astra-generated explicit delta;
- physical comparison.

Only after repeated use should the required Authoring operations be promoted into SKIN.

This avoids designing a large editing system before learning how the Author actually wants to intervene.

## Torus — later generalization / stress test

Torus remains later than Mocomoco.

Its role is different:

- Mocomoco = artwork + feedback-method learning;
- Torus = topology / Void / wraparound / fabrication generalization probe.

Torus introduces stronger ambiguity through:

- central hole;
- wraparound structure;
- inside/outside relations;
- Void continuity;
- multi-angle openness;
- backside / removal access;
- fabrication paths around a nontrivial topology.

Starting Torus too early would make it difficult to know whether a failure comes from:

- Author feedback communication;
- generator limitation;
- topology / Void representation;
- Support / removal access;
- toolpath;
- source / coordinate / scale error.

Torus should be used once the system can at least identify **why** it failed.

## Generator freeze

Do not restart branch-generator research now.

Keep the present generator as a Research baseline through:

- the four-candidate physical closure;
- the first Mocomoco baseline;
- initial Mocomoco feedback-method testing.

This freeze protects causal learning. It does not declare the present 96-junction / 95-core lineage to be a universal algorithm.

### Reopen generator research only with stronger evidence

Possible triggers:

- the same Author-desired spatial relation repeatedly cannot be produced with local deltas;
- surface participation repeatedly destroys an important Void / sight-line because of a systematic generator tradeoff;
- Fabrication D1 repeatedly has to alter the artwork substantially;
- a later Torus probe shows the same generator-level failure after source, coordinates, Support, and toolpath causes have been excluded.

Do not reopen generator research because of a single:

- print warning;
- lower-region failure;
- local Support problem;
- removal breakage.

## Research / Production boundary

The responsibility boundary is:

> **Astra / SKIN_R determine what is useful and under what conditions. SKIN_ABC / Production decide which selected capability is worth making durable and repeatable.**

### Astra Research / SKIN_R

Own:

- source / parameters / history;
- experiments;
- limits / exceptions;
- physical correspondence;
- artwork / fabrication / toolpath distinction;
- reproducible research deltas.

### SKIN_ABC / Production

Own, when explicitly selected:

- stable representation;
- save / reopen;
- compatibility;
- interaction quality;
- output;
- performance;
- maintenance;
- integration with existing Production semantics.

Preserve the distinction already present in `SKIN_ABC_CURRENT`:

1. `R reproducible`
2. `SKIN reproducible`
3. `Generalizable`

A capability may become `SKIN reproducible` for a selected work before Torus. A general claim about multiple topologies should wait for later generalization evidence.

## Things explicitly deferred

Do not currently start:

- new branch generator research;
- speculative full branch / junction Authoring UI;
- Mocomoco / Torus generation before exact source selection;
- common AB/C kernel creation;
- Support-method unification;
- Production architecture rewrite;
- copying B_OPEN geometry / coordinates / Support as universal rules;
- broad internal-branch thickening.

## Immediate priorities

Current priorities are intentionally small:

1. **Close SKIN_R Reader v0 / Fix 1 correctly.**
2. **Continue physical evaluation of the four current candidates.**
3. **Use completed physical work with the Reader as soon as the Reader is trustworthy.**
4. **Record the operations the Author actually wished existed.**
5. **After the four-candidate phase is bounded, select the exact FUWAFUWA Mocomoco source.**

No Mocomoco implementation, Torus implementation, Authoring expansion, generator restart, or Production translation is authorized by this observation.

## Core roadmap principle

The current Research emphasis moves away from “make Astra a progressively more sophisticated generator” toward:

> **Make it possible for the Author to look at a physical work, identify what the computational system did, and give a precise spatial response back to it.**

Mocomoco is the next domain for learning that loop.

Torus is the later domain for testing where the learned principles stop working.
