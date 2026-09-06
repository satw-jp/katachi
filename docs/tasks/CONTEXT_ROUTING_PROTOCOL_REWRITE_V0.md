# Context Routing Protocol Rewrite v0

Date: 2026-09-07
Owner: Overall SOL
Implementation owner: Organization / maintenance LUNA
Status: READY FOR IMPLEMENTATION

## Purpose

Implement the first context-routing protocol rewrite from the accepted read-only audit without changing project code, lane semantics, active task scope, or historical evidence authority.

Central design principle:

> SOL creates the smallest world LUNA needs to understand.

This is a progressive-disclosure / context-routing change, not a documentation compression project.

## Read first

Required:
1. this task
2. `docs/tasks/CONTEXT_ROUTING_PROTOCOL_READONLY_AUDIT_V0.md`
3. `AGENTS.md`
4. `docs/TEAM_REPORTING_RULES.md`
5. `docs/status/_CURRENT_TEMPLATE.md`
6. `docs/status/VIEWER_CURRENT.md`

Do not preload unless a concrete dependency arises:
- `STATEMENT.md`
- `RESEARCH.md`
- other lane CURRENTs
- old task specs
- broad architecture / research documents

If one of those becomes concretely necessary, load only the needed source and record why.

## Working method

Create a dedicated documentation branch from current `main`.
Preferred branch:

`agent/context-routing-protocol-v0`

Do not edit `main` directly after creating the branch.

No production code changes.
No lane implementation changes.
No active worker branch changes.
No deletion of historical evidence.
No bulk CURRENT rewrite in this task.

## A. Thin `AGENTS.md`

Rewrite `AGENTS.md` into a small project constitution.

It should keep only rules that truly apply to all agents / humans, including at minimum:

- GitHub technical authority / CURRENT / task authority order;
- do not expand scope opportunistically;
- do not destroy or hide dirty / unpushed work;
- do not invent architecture when task information is insufficient;
- respect branch / commit / push boundaries;
- physical / hardware acceptance remains an author/manual gate where applicable;
- task protected scope and exact done criteria are authoritative.

Remove global mandatory preload of `STATEMENT.md`, `RESEARCH.md`, all Study README / manifest, and unrelated lane material.

Project philosophy / research sources remain available to SOL / Research roles by concrete need or named pointer; they are not mandatory LUNA preload.

Hikari-specific current-version verification must not disappear. Move or point it to a Hikari-specific reference rather than forcing all non-Hikari workers to preload it.

## B. Create `TEAM_PROTOCOL_CORE.md`

Create:

`docs/TEAM_PROTOCOL_CORE.md`

Keep it deliberately small. It is the normal always-preloaded operational protocol.

It must contain only the minimum needed for routine work:

- authority order;
- SOL owns scope / architecture / acceptance / next gate;
- LUNA owns bounded implementation / tests / artifacts;
- no scope expansion;
- evidence honesty (`PROVEN / SUPPORTED / UNVERIFIED / HOLD / BLOCKED` etc.);
- dirty / unpushed state must be explicit;
- minimum CURRENT visibility;
- minimum completion handoff to SOL;
- short physical/manual-author gate principle;
- fail closed when task requirements conflict or required information is missing.

Target: small enough to be practical as an always-preloaded file. Do not reproduce all old TEAM rules inside CORE.

## C. Split detailed protocol references

Create progressive-disclosure references under:

`docs/protocol/`

At minimum:

- `CURRENT_FORMAT.md`
- `HANDOFF_REFERENCE.md`
- `EVIDENCE_REFERENCE.md`
- `LOCAL_DIRTY_WORK.md`
- `CAPABILITY_RETENTION.md`
- `READ_SETS.md`

Move / restate detailed rules from `TEAM_REPORTING_RULES.md` into the appropriate reference without changing their meaning.

References are loaded only when relevant.

Keep intentional safety duplication where useful:
- evidence honesty;
- dirty/unpushed disclosure;
- physical/manual author gate;
- task protected scope / exact acceptance.

## D. Compatibility path for `TEAM_REPORTING_RULES.md`

Do not delete `docs/TEAM_REPORTING_RULES.md` yet.

Turn it into a compatibility / migration entry point that:

- points to `TEAM_PROTOCOL_CORE.md` for normal operation;
- points to `docs/protocol/*` for details;
- explains that old task pointers remain valid during transition;
- does not itself remain a second full protocol copy.

Do not break old task specs merely because they still name `TEAM_REPORTING_RULES.md`.

## E. Standard task header

Define a standard task-reading header in the protocol reference / template:

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
- broad architecture / research docs

If a concrete dependency arises, load only the needed source and report why.
```

`Do not preload` is deliberate. Do not use `Do not read`.

Task-specific protected scope, exact done criteria, and named evidence pointers remain in the task.

Do not mass-edit all historical task specs in this task.

## F. CURRENT front-section format

Update `docs/status/_CURRENT_TEMPLATE.md` to define a fixed front section in this order:

1. Authority
2. NOW / Current phase
3. Active task
4. Blocker
5. Next gate
6. Protected
7. Required pointers
8. separator
9. retained context / evidence pointers / historical details

Normal operation should be possible from roughly the first 50-100 lines where practical.

Do not delete useful retained context merely to hit a line count. The front section is a bounded routing layer, not a hard truncation rule.

The front must preserve links explaining why the current state exists.

## G. Role-specific standard read sets

Record role-specific preload defaults in `docs/protocol/READ_SETS.md`.

Minimum intent:

- Overall SOL: CORE + relevant CURRENT fronts + relevant task; cross-lane only when the decision actually depends on it.
- Team SOL: CORE + own lane CURRENT front + task; evidence / dependency pointers on demand.
- LUNA: CORE minimum + lane CURRENT front + bounded task + named code/evidence.
- Research SOL: CORE + research task/current + relevant research sources; implementation lanes only via named dependencies.
- Research Astra: research task + named packages/evidence; do not preload full AB/C/HANA/etc CURRENTs by default.
- Organization / maintenance LUNA: CORE + infrastructure task + exact paths/state; no project philosophy preload.
- Viewer SOL/LUNA: CORE + Viewer CURRENT front + Viewer task; no other-lane philosophy/current by default.

`STATEMENT.md`, `RESEARCH.md`, architecture docs, historical reports, and other lane CURRENTs remain available by concrete need; they are not globally forbidden.

## H. Viewer pilot only

Use Viewer as the low-risk pilot because its implementation is technically closed and currently at Author Review.

On the protocol branch only:

- reshape `docs/status/VIEWER_CURRENT.md` into the new fixed-front structure;
- retain the same semantic state, authority, blockers, HOLD rules, evidence boundary, and Author Review gate;
- do not change Viewer code, FKEI, Production, merge/deploy state, or Author Review meaning.

Measure the Viewer routine preload before/after using document count and approximate words/lines.

Do not apply the CURRENT rewrite yet to AB / C / HANA / ART / Research in this task.

## I. Safety regression checks

Before handoff, verify that the rewrite still preserves or clearly routes all of these:

- technical authority order;
- SOL vs LUNA responsibility split;
- no scope expansion;
- evidence honesty;
- dirty/unpushed disclosure;
- physical/manual author gate;
- capability-retention rule;
- CURRENT active-task visibility;
- completion handoff minimum;
- fail-closed behavior on contradictions / missing information;
- Hikari-specific current-version gate remains reachable for Hikari work;
- old task pointers to `TEAM_REPORTING_RULES.md` do not become broken.

Any semantic loss is FAIL / STOP.

## J. Measurement

Return a compact before/after estimate for the Viewer pilot and protocol core:

- always-preloaded document count;
- approximate words / lines;
- number of transitive mandatory reads removed;
- cross-lane documents no longer preloaded;
- any rule intentionally duplicated for safety;
- any rule whose canonical location changed.

Do not claim runtime/token savings beyond what the measured document reduction supports.

## Protected scope

Do not:

- change project code;
- change AB / C / HANA / ART active implementation semantics;
- change Research task meaning;
- modify artwork criteria;
- delete `STATEMENT.md` / `RESEARCH.md` / architecture / evidence;
- rewrite all historical tasks;
- rewrite all CURRENTs in one pass;
- merge/deploy production branches;
- alter active migration / print / hardware gates;
- weaken evidence, dirty-work, or author physical-gate safety rules.

## Done when

Ready for Overall SOL review when:

1. thin `AGENTS.md` exists on the protocol branch;
2. `TEAM_PROTOCOL_CORE.md` exists and is genuinely small;
3. detailed references exist under `docs/protocol/`;
4. `TEAM_REPORTING_RULES.md` is a compatibility entry point rather than a second full protocol;
5. task `Required reading / Do not preload` standard exists;
6. CURRENT fixed-front template exists;
7. role-specific read sets exist;
8. Viewer CURRENT pilot is complete with no semantic drift;
9. safety regression checklist passes;
10. before/after preload estimate is reported;
11. branch is pushed;
12. no non-document project state was changed.

Return only a compact handoff:

```text
Overall SOL review用:

branch:
commit:
AGENTS reduction:
CORE size:
references created:
TEAM compatibility status:
CURRENT template status:
Viewer pilot status:
preload before/after:
safety regression check:
semantic drift found?: YES/NO
blocker:
```

STOP for Overall SOL review. Do not merge to main automatically.
