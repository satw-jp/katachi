# Team Reporting / Current-State SSOT Rules v0

Date: 2026-09-06

## Purpose

Reduce long chat handoffs and duplicated status reports.

GitHub is the technical current-state SSOT for implementation-facing project status. Chat is for judgment, instructions, author feedback, and decisions. Google Drive remains appropriate for research packages, images, large comparison artifacts, and cross-project material that does not belong in the repo.

The goal is not to create a new documentation project. The goal is to make the latest technical state easy to read without rewriting a long report in every chat.

---

## 1. Core rule

For implementation-facing teams:

```text
work / test / gate
↓
checkpoint commit
↓
update CURRENT status document
↓
push working branch
↓
chat sends only a short pointer
↓
reviewer reads GitHub directly
```

Do not write a new long-form overall report after every bounded task.

Git history is the history. `CURRENT` is the present.

---

## 2. Source-of-truth split

### GitHub

Use for:

- code
- tests
- branch / commit authority
- current implementation status
- current gates / blockers
- capability retention status
- technical decisions that must stay aligned with code
- checkpoint-specific implementation notes

### Google Drive

Use for:

- Research Astra / Research SOL packages
- large reports and literature reviews
- comparison images / videos
- artwork reference packages
- large exported artifacts when repo storage is inappropriate
- cross-project handoffs that are not code-lineage-specific

### Chat

Use for:

- author judgment
- design / architecture discussion
- approval / rejection
- next-task instruction
- ambiguity resolution
- physical observation
- short status pointer to the GitHub SSOT

Chat is not the long-term technical SSOT.

---

## 3. Team current-state documents

Each active implementation-facing lane should maintain one stable current-state document instead of creating `report-final-2.md` style files repeatedly.

Recommended paths:

```text
docs/status/AB_CURRENT.md
docs/status/C_CURRENT.md
docs/status/HANA_CURRENT.md
docs/status/ART_CURRENT.md
```

Add another `*_CURRENT.md` only when an active lane genuinely needs one.

Research-heavy material may keep its own research package instead of forcing everything into this structure.

---

## 4. Required CURRENT structure

Keep `*_CURRENT.md` compact. It should answer only what a reviewer needs to resume work correctly.

```text
# <Team> Current Status

Last verified:

## Current authority
- repo / branch
- HEAD
- working tree
- relevant artifact fingerprint / hash when needed

## Current phase
- what the team is doing now

## Active implementation instruction
- owner
- task
- purpose
- allowed scope
- protected scope
- done when
- instruction source / task-spec pointer when needed

## PASS / CLOSED
- only currently relevant completed gates

## Current blocker
- one or a few active blockers

## Next gate
- exact next decision / execution gate

## HOLD / DO NOT CHANGE
- protected semantics / architecture / physical parameters

## Relevant artifacts
- paths / hashes / Drive pointers only when needed

## Evidence boundary
- what is proven
- what is not yet proven
```

Avoid retelling the entire project history.

---

## 5. Evidence language

A `CURRENT` document must distinguish at least:

```text
PASS / PROVEN
SUPPORTED
UNVERIFIED
NOT STARTED
HOLD
BLOCKED
SUPERSEDED
```

Do not convert:

```text
branch exists
```

into:

```text
capability is PRESENT
```

without current verification.

Likewise:

```text
tests PASS
!= physical PASS
!= artwork PASS
```

Keep Code / Geometry / Export / Physical / Artistic gates separate when relevant.

---

## 6. Capability retention

For SKIN and other systems with many historical branches, capability presence must be verified against the current production lineage.

```text
historical implementation exists
!= current production retains it
```

Use the project's capability ledger where applicable.

Do not bulk-merge historical branches just to recover features. Restore only capabilities that are still required and semantically valid in the current architecture.

---

## 7. Chat reporting format

After a pushed checkpoint, the normal chat report should be short.

Example:

```text
C updated.

branch: <branch>
commit: <sha>
status: docs/status/C_CURRENT.md updated
current blocker: <one line>
next gate: <one line>

Please read the CURRENT file and review the next gate.
```

That is enough unless the author or reviewer asks for more detail.

Do not paste hundreds of lines already available in GitHub.

---

## 8. When a long report is still appropriate

Create a dedicated snapshot report only for meaningful boundaries such as:

- research round closure
- architecture decision
- first physical print
- migration / production-baseline lock
- major failure forensics
- full-practice audit
- competition / external handoff

These reports are checkpoint artifacts, not the everyday current-state mechanism.

---

## 9. Uncommitted / unpushed work

GitHub cannot represent local dirty work that has not been pushed.

When a task must stop before commit / push:

1. keep the chat update short;
2. state branch / HEAD / dirty status;
3. state the exact blocker / manual gate;
4. do not pretend GitHub reflects the uncommitted state;
5. use Drive or another explicit handoff only if the uncommitted evidence must be shared across chats.

Once the checkpoint is safe to commit, update the CURRENT file and push the working branch.

---

## 10. Role split

### SOL

Owns:

- architecture
- scope
- evidence interpretation
- next gate
- acceptance / rejection
- keeping CURRENT semantics correct
- writing the bounded instruction for LUNA / Implementation SOL
- deciding when an implementation checkpoint is accepted into the canonical CURRENT state

### LUNA / Implementation SOL

Owns:

- bounded implementation given by its SOL
- tests
- artifacts
- checkpoint commit / push when permitted by the task
- updating implementation facts in CURRENT when the task branch contains that document
- returning only the short implementation pointer needed for SOL review

LUNA / Implementation SOL does not independently expand architecture, redefine gates, or self-approve a task as globally CLOSED.

### Astra

Use primarily for:

- uncertain research questions
- alternative geometry / generative exploration
- high-level audits
- difficult architecture questions

Do not require Astra to write routine production status prose when the repo already contains the facts.

### SOL → implementation routing

The default routing is:

```text
Author / Overall SOL asks for a goal
↓
Team SOL reads CURRENT + evidence
↓
Team SOL writes a bounded implementation instruction
↓
LUNA / Implementation SOL executes only that scope
↓
checkpoint + tests + artifacts
↓
Team SOL reviews
↓
Team SOL accepts / rejects / defines next gate
```

The author should not need to manually rewrite the SOL instruction for LUNA.

When an old LUNA chat is reused, the Team SOL must include the current branch / authority / protected scope in its first instruction so stale chat context cannot become authority.

### CURRENT across old task branches

Some active task branches may predate `docs/TEAM_REPORTING_RULES.md` or `docs/status/*_CURRENT.md`.

Do **not** merge, rebase, or otherwise alter production lineage merely to obtain these documentation files.

Instead:

- read the reporting rules from `main` / `origin/main` / GitHub;
- keep implementation work on the task's authorized lineage;
- if practical, add/update the lane CURRENT in the task branch as documentation only;
- regardless, the Team SOL is responsible for ensuring the canonical CURRENT state reflects the accepted checkpoint after review.

A worker's status edit is evidence input, not automatic SOL acceptance.

---

## 11. No self-approval by prose

A long report is not evidence.

Whenever possible, reviewers should inspect:

- committed code
- tests
- hashes / fingerprints
- generated artifacts
- screenshots / physical evidence

The CURRENT document points to evidence; it does not replace evidence.

---

## 12. Keep the system lightweight

This reporting system itself must not become another project.

Rules:

- one stable CURRENT file per active lane
- edit the existing file rather than creating a new report each task
- keep it short
- let Git preserve history
- archive completed temporary implementation chats
- open a new temporary implementation chat when a future bounded problem actually needs one

---

## 13. Default operating loop

```text
SOL reads CURRENT and defines bounded task
↓
SOL records the active bounded instruction in CURRENT (or links a detailed task spec)
↓
SOL sends the implementation instruction to LUNA / Implementation SOL
↓
LUNA / Implementation SOL executes
↓
tests / artifact gate
↓
checkpoint commit + push when permitted
↓
short implementation pointer
↓
SOL reviews code / tests / artifacts
↓
SOL ensures canonical CURRENT is correct
↓
next decision
```

This is the default unless a task explicitly requires a different gate.

---

## 14. Active implementation visibility

Implementation scope must not exist only inside a LUNA / temporary-worker chat.

Before any non-trivial implementation task starts, Team SOL must make the active instruction visible in the lane CURRENT. The author should be able to answer, from GitHub alone:

```text
What is being implemented right now?
Why?
Who is doing it?
What may change?
What is protected?
What exact gate ends the task?
```

For a complex task, keep CURRENT compact and put the full bounded specification under `docs/tasks/`, then link that path from `Active implementation instruction`.

For trivial actions such as app launch, read-only inspection, or a one-line display check, a separate task specification is not required.

If no implementation is active because the lane is waiting on a manual / physical / author gate, state that explicitly in the same section. Silence must not be interpreted as “something is probably being implemented.”
