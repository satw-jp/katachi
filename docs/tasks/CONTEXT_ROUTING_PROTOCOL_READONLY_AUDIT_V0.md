# Context Routing / Progressive Disclosure — Read-only Audit v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READ-ONLY AUDIT

## Purpose

Audit the current agent/document loading model before changing any governance files.

The goal is not generic documentation cleanup or token minimization. The goal is to redesign **context routing** so that each agent reads only the world it is responsible for, while preserving safe escalation when more context is concretely needed.

Central design principle:

> SOL creates a world LUNA does not need to understand beyond the bounded task.

Keep the existing `CURRENT + bounded task + evidence + SOL review` architecture. This audit must identify where the current repository still forces agents to preload unnecessary global, historical, cross-lane, or duplicated context.

## Strict scope

This task is:

- READ
- MEASURE
- CLASSIFY
- PROPOSE

This task is **not** authorized to:

- edit, move, delete, rename, split, rewrite, or shorten governance documents;
- change `AGENTS.md`;
- change `docs/TEAM_REPORTING_RULES.md`;
- change any `*_CURRENT.md`;
- change task specs;
- change architecture / research / vision documents;
- change code;
- commit any content except the audit report itself if explicitly requested by Overall SOL later;
- push preservation or implementation branches;
- alter any active lane.

Return recommendations only. Overall SOL decides the rewrite phase separately.

## Read first

Audit these as current sources, without modifying them:

- `AGENTS.md`
- `docs/TEAM_REPORTING_RULES.md`
- `docs/status/README.md`
- `docs/status/AB_CURRENT.md`
- `docs/status/C_CURRENT.md`
- `docs/status/HANA_CURRENT.md`
- `docs/status/ART_CURRENT.md`
- `docs/status/VIEWER_CURRENT.md`
- `docs/status/_CURRENT_TEMPLATE.md`

Also inspect a representative sample of active/recent task specs under `docs/tasks/`, including at least one each from:

- AB
- C
- HANA
- Viewer
- Research / Astra
- infrastructure / migration

Inspect `STATEMENT.md`, `RESEARCH.md`, and representative `docs/architecture/`, `docs/research/`, `docs/vision/` material only to classify who actually needs them preloaded. Do not deep-read entire trees when headings / references are enough.

## Design target to evaluate against

Desired authority / context flow:

```text
STATEMENT / RESEARCH / architecture / research / vision
                    ↓
                   SOL
                    ↓
                 CURRENT
                    ↓
               bounded task
                    ↓
                  LUNA
                    ↓
                 evidence
                    ↓
                SOL review
```

Horizontal preload should be exceptional rather than default.

Examples that should normally disappear:

- C LUNA preloading AB/HANA/ART CURRENTs;
- Viewer LUNA preloading HANA/SKIN-wide philosophy;
- implementation workers preloading `STATEMENT.md` / `RESEARCH.md` merely to verify SOL's task;
- Team SOL preloading all historical architecture/research documents on every normal checkpoint;
- repeated reading of the same role/scope/evidence rules from `AGENTS.md`, protocol, CURRENT and task spec.

## Key target model

### 1. `AGENTS.md` — thin constitution

Audit which current rules are truly repository-global and mandatory for every actor.

Expected future shape is very small: authority basics, scope discipline, dirty-work safety, no speculative architecture changes, physical-author gate, branch/commit basics, and pointer to the operational protocol.

Do **not** assume current mandatory preload of `STATEMENT.md` / `RESEARCH.md` is still appropriate for every implementation worker.

### 2. `TEAM_PROTOCOL_CORE` + references

Evaluate splitting `docs/TEAM_REPORTING_RULES.md` into a very small always-loaded operational core plus progressive-disclosure references.

Candidate future structure:

```text
docs/TEAM_PROTOCOL_CORE.md

docs/protocol/
  CURRENT_FORMAT.md
  EVIDENCE_REFERENCE.md
  HANDOFF_REFERENCE.md
  CAPABILITY_RETENTION.md
  LOCAL_DIRTY_WORK.md
  ...only when genuinely needed
```

The audit should identify which exact rules belong in CORE and which belong in references.

CORE should contain only what normal SOL/LUNA operation needs every time, such as:

- authority order;
- SOL vs LUNA responsibility;
- scope rule;
- evidence honesty rule;
- minimum handoff format;
- minimum current-state visibility rule.

### 3. CURRENT — fixed front section, retained context below

Do not optimize primarily for shortest file size.

Audit a standard **fixed front section** that normal operation can read without loading the rest:

```text
# <Lane> CURRENT
## Authority
## NOW
## Active task
## Blocker
## Next gate
## Protected
## Required pointers
--- Below: retained context / evidence pointers ---
```

Target: roughly first 50–100 lines, or another justified fixed budget, should answer normal resume/review questions.

Below the separator, useful retained context may remain when it prevents SOL from hunting through history. Old detailed evidence itself should usually live elsewhere, but CURRENT should preserve dependency/evidence pointers explaining why the current state exists.

Classify current sections into:

- FRONT — normal preload;
- RETAINED CONTEXT — same file but below fold;
- EXTERNAL EVIDENCE — should live elsewhere with pointer;
- REMOVE DUPLICATION — redundant with canonical protocol/task/evidence.

### 4. Task specs — `Required reading` and `Do not preload`

Audit a standard task header that defines the implementation worker's world.

Use the term **Do not preload**, not `Do not read`.

Desired semantics:

> Do not load these documents by default. If a concrete need arises to finish the bounded task safely, read only the needed source and report why it was necessary.

Candidate header:

```text
## Required reading
1. this task
2. relevant CURRENT front section
3. named code / evidence pointers

## Do not preload
- STATEMENT.md
- RESEARCH.md
- other lane CURRENTs
- old tasks
- broad architecture/research docs

If one becomes concretely necessary, read only that source and report the reason.
```

Detect task specs that currently duplicate large amounts of CURRENT/protocol/architecture context rather than linking it.

### 5. Standard read sets by role

Propose minimal normal preload sets for at least:

- Overall SOL
- Team SOL
- LUNA / implementation worker
- Research SOL
- Research Astra
- organization / maintenance LUNA
- Viewer SOL/LUNA if materially distinct

Distinguish:

- ALWAYS PRELOAD
- CURRENT/TASK DEPENDENT
- LAZY LOAD ON CONCRETE NEED
- NEVER CROSS-LANE BY DEFAULT

## What to measure

Do not report token count alone. Measure / estimate the following:

1. **Document size**
   - lines
   - approximate words / characters / tokens if practical

2. **Mandatory-read fanout**
   - what one rule tells an agent to read next;
   - transitive mandatory dependencies;
   - example: `AGENTS -> STATEMENT -> RESEARCH -> TEAM_REPORTING -> task -> README/manifest`.

3. **Rule duplication**
   Detect materially repeated rules across:
   - `AGENTS.md`
   - `TEAM_REPORTING_RULES.md`
   - CURRENTs
   - task specs
   - Study README/manifest conventions

   Examples:
   - role split;
   - scope expansion prohibition;
   - authority order;
   - handoff format;
   - evidence language;
   - branch / dirty-work handling;
   - protected-scope repetition.

4. **Audience mismatch**
   Flag content that is useful for SOL/research but currently mandatory for LUNA, such as:
   - artwork philosophy;
   - global architecture;
   - research framing;
   - other-lane status;
   - historical rationale already compressed by SOL.

5. **Historical-evidence loading**
   Identify detailed PASS facts / old gate narratives that are useful as retained context but should not be in normal preload.

6. **Cross-lane dependency**
   Identify where a lane is genuinely dependent on another lane vs where cross-lane reading is precautionary only.

7. **'Read just in case' triggers**
   Find wording such as:
   - `must read all`;
   - `read first` with broad global lists;
   - `as needed` without a bounded trigger;
   - task instructions that ask LUNA to independently verify global alignment already owned by SOL.

8. **Responsibility duplication**
   Identify cases where both SOL and LUNA are asked to verify the same architectural/vision alignment.

The intended future responsibility split is:

```text
SOL: task is correct relative to higher-level intent / architecture.
LUNA: implementation is correct relative to bounded task and protected scope.
```

LUNA still fails closed if the task conflicts internally or necessary facts are missing; it does not normally re-audit the master plan.

## Required audit table

Produce a table with at least:

| Content / rule | Current location | Duplicated / transitively required by | Current readers | Actually needed by | Recommended canonical location | Preload class | Notes / risk |
|---|---|---|---|---|---|---|---|

Preload class must be one of:

- `ALWAYS`
- `LANE CURRENT FRONT`
- `TASK REQUIRED`
- `LAZY / CONCRETE NEED`
- `REFERENCE ONLY`
- `HISTORICAL / EVIDENCE`

## Mandatory-read graph

Provide a compact before/after dependency graph.

### Current observed routing

Show the actual transitive read graph implied by current docs for a typical:

- Team SOL session;
- C/AB/HANA/Viewer LUNA implementation task;
- Research Astra task.

### Proposed routing

Show the proposed progressive-disclosure graph with the same roles.

The goal is to make visible how many global/cross-lane documents disappear from normal preload.

## Quantitative estimate

Give a rough estimate of:

- current normal preload size for representative SOL and LUNA flows;
- proposed normal preload size;
- expected reduction range;
- which reduction comes from less text vs fewer documents / fetches / searches.

Do not overclaim precision. A directional estimate is enough.

## Safety / regression analysis

For every recommended removal from mandatory preload, state what prevents loss of safety.

Examples:

- remove global vision preload from LUNA -> SOL owns vision-to-task compression + task protected scope;
- remove other-lane CURRENT preload -> cross-lane dependencies must be explicit pointers in the lane CURRENT/task;
- move evidence detail below CURRENT fold -> CURRENT front retains evidence pointer and gate state;
- split protocol -> CORE keeps evidence-honesty and scope discipline mandatory.

Flag any current rule that should remain duplicated intentionally for safety, rather than deduplicated blindly.

## Proposed migration phases

Recommend, but do not execute, a safe phased rewrite plan.

Expected order to evaluate:

1. approve audit;
2. shrink `AGENTS.md` mandatory preload / reading chain;
3. create `TEAM_PROTOCOL_CORE` and move details to references;
4. standardize task `Required reading` / `Do not preload`;
5. standardize CURRENT fixed front section;
6. move completed evidence details out of normal preload while retaining pointers;
7. fix role-specific standard read sets;
8. pilot on one low-risk lane before broad rollout.

Identify which lane is safest for a pilot and why.

## Output

Create one audit report proposal only if Overall SOL explicitly authorizes a file write after execution. Otherwise return a compact handoff containing:

```text
Overall SOL review用:

audit coverage:
current mandatory-read hotspots:
largest duplicate rule groups:
audience mismatch:
transitive preload problems:
CURRENT front-section recommendation:
TEAM_PROTOCOL_CORE recommendation:
task Required reading / Do not preload recommendation:
role-specific read sets:
current vs proposed preload estimate:
safety regressions to guard against:
recommended pilot lane:
recommended rewrite sequence:
blockers / unknowns:
ready for Overall SOL protocol design?: YES/NO
```

## Protected scope

Do not touch active AB physical-print work, C, HANA, ART, Viewer, Research, storage migration, or production code while auditing governance context.

Do not optimize for token count at the expense of authority clarity, evidence traceability, or fail-closed behavior.

## Done when

Overall SOL can decide a protocol rewrite without asking the audit worker to rediscover:

- where repeated context comes from;
- which actor actually needs each rule;
- what must stay mandatory for safety;
- what can become lazy-loaded;
- how CURRENT can become a dependency-graph entrance rather than a historical log;
- how to reduce both context tokens and document-fetch latency without breaking the existing SSOT model.

STOP. No governance rewrite in this task.
