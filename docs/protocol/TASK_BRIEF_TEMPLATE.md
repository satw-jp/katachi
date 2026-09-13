# <Bounded task title>

## Goal
<One observable outcome and why it matters now.>

## Authority / assignment
- CURRENT or research authority: `<path / source and ref>`
- execution: `<repo, authorized branch, base/checkpoint, workspace if binding>`
- decision owner / assigned implementer: `<names; model choice is not assignment>`
- required contract/evidence: `<only the sources needed for this task>`

## Scope
- may change: `<bounded files/components/artifacts>`
- must preserve: `<semantics, user inputs, frozen artifacts, other lanes>`
- non-goals: `<only plausible scope-expansion risks>`

## Implementation done
<Verifiable outputs, relevant validation, result inspection, and evidence location. Include the running/inspected result when that is part of the goal. Fix change-caused failures within scope; report unrelated failures without silently expanding the task. State any CURRENT update required.>

## Permissions / resource boundary
- Git: `<explicit branch creation / commit / push / PR permissions; merge/deploy separate>`
- execution: `<permitted local fixtures/runtime; shared, external, paid, or hardware limits>`
- exploration: `<candidate count, expensive-run budget, or other bound when relevant>`

## Stop / handoff
- stop for: `<task-specific review gates; author/physical action; unresolved material authority/safety/scope conflict>`
- handoff to: `<owner; exact next gate>`

Complete the authorized scope without intermediate approval for each ordinary local step. This does not waive an explicit review stop, budget, or gate, grant missing permissions, or authorize the next task. Report evidence and remaining acceptance separately.
