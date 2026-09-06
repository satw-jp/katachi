# Team Reporting / Current-State SSOT Rules v1

Date: 2026-09-06

## Purpose

Reduce long chat handoffs and duplicated status reports without making active work invisible.

GitHub is the technical current-state SSOT for implementation-facing project status and non-trivial implementation instructions. Chat is for judgment, short explanations, author feedback, approvals, and relaying pointers between separate SOL / LUNA chats. Google Drive remains appropriate for research packages, images, large comparison artifacts, and cross-project material that does not belong in the repo.

The goal is not to create a documentation project. The goal is:

- the author can see what is being implemented;
- SOL chats do not become heavy with repeated long prompts / reports;
- the author does not have to copy hundreds of lines between chats;
- Git history preserves technical history while CURRENT shows the present.

---

## 1. Core operating rule

For implementation-facing teams:

```text
Team SOL decides the bounded task
↓
SOL records the real implementation instruction in GitHub
(CURRENT or docs/tasks/...)
↓
SOL chat gives the author a short explanation + task pointer
↓
Author relays only the pointer / start instruction to LUNA
↓
LUNA reads GitHub and implements
↓
LUNA tests / artifacts / checkpoint commit + push when permitted
↓
LUNA chat returns a short explicit completion handoff for SOL
↓
Author relays that short handoff to SOL
↓
SOL reads GitHub evidence and reviews
↓
SOL accepts / rejects / defines next gate and updates canonical CURRENT
```

Separate ChatGPT chats do not directly message each other. The author is therefore the small relay between chats, but should relay only compact pointers / completion summaries, not full technical specifications or long status reports.

---

## 2. Source-of-truth split

### GitHub

Use for:

- code and tests
- branch / commit authority
- current implementation status
- current gates / blockers
- non-trivial LUNA / Implementation SOL task specifications
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
- short explanation of what is about to be implemented and why
- short task pointer from SOL to implementation worker
- short completion handoff from implementation worker back to SOL
- ambiguity resolution
- physical observation

Chat is not the long-term technical SSOT and should not duplicate long GitHub task specs or CURRENT content.

---

## 3. Team CURRENT documents

Each active implementation-facing lane maintains one stable current-state document, for example:

```text
docs/status/AB_CURRENT.md
docs/status/C_CURRENT.md
docs/status/HANA_CURRENT.md
docs/status/ART_CURRENT.md
```

Do not create `report-final-2.md` style files for routine checkpoints. Update the stable CURRENT file and let Git history preserve previous states.

Research-heavy material may keep its own research package instead of forcing everything into this structure.

---

## 4. Required CURRENT structure

Keep `*_CURRENT.md` compact. It should answer what a reviewer needs to resume work correctly.

```text
# <Team> Current Status

Last verified:

## Current authority
- repo / branch / HEAD / working tree
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
- instruction source / docs/tasks pointer

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

If no implementation is active because the lane is waiting on an author / manual / physical gate, state that explicitly.

---

## 5. Active implementation visibility

Implementation scope must not exist only inside a LUNA / temporary-worker chat.

Before any non-trivial implementation task starts, Team SOL must make the active instruction visible in GitHub. From GitHub alone, the author should be able to answer:

```text
What is being implemented right now?
Why?
Who is doing it?
What may change?
What is protected?
What exact gate ends the task?
```

For a small task, `Active implementation instruction` in CURRENT is enough.

For a complex task, keep CURRENT compact and put the full bounded specification under `docs/tasks/`, then link that path from CURRENT.

Trivial actions such as app launch, read-only inspection, or a one-line display check do not require a separate task document.

---

## 6. SOL chat contract — before implementation

SOL should still tell the author what it is asking LUNA to do, because complete invisibility is undesirable.

But the SOL chat message should be a short human-readable explanation, not the full implementation prompt.

Normal form:

```text
次は <task name> をLUNAに実装させます。
目的: <1-2 lines>
変更範囲: <1 line>
保護: <1 line>
終了条件: <1 line>

実装指示は GitHub:
<docs/status/...CURRENT.md or docs/tasks/...md>

LUNAには「上記を読んで開始」とだけ伝えてください。
```

The author may ask for more explanation at any time, but should not be required to copy the full technical instruction into LUNA chat.

---

## 7. LUNA / Implementation SOL chat contract — after implementation

When a bounded task ends, LUNA / Implementation SOL should return a short explicit handoff addressed to the reviewing SOL.

Normal form:

```text
<SOL name> review用:

実施: <what was changed, 1-3 lines>
branch: <branch>
commit: <sha or NO COMMIT>
CURRENT/task status: <path / updated or not>
tests: <short result>
artifact/gate: <short result>
blocker: <NONE or one line>

SOLはGitHubのCURRENT / task spec / commit evidenceを読んでreviewしてください。
```

The author relays this compact message to SOL. The author does not need to rewrite it or produce a separate status report.

If work stopped before commit / push, LUNA must explicitly say local / dirty / unpushed and give the exact manual gate or blocker.

---

## 8. SOL review contract

A LUNA completion message is a pointer, not approval.

SOL must review the relevant GitHub evidence and then decide:

- ACCEPT / PASS
- REJECT / FIX REQUIRED
- HOLD
- next bounded gate

LUNA / Implementation SOL does not independently expand architecture, redefine gates, or self-approve a task as globally CLOSED.

A worker's CURRENT edit is evidence input, not automatic SOL acceptance.

---

## 9. Evidence language

CURRENT and reviews should distinguish at least:

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

## 10. Capability retention

For SKIN and other systems with many historical branches:

```text
historical implementation exists
!= current production retains it
```

Use the project capability ledger where applicable.

Do not bulk-merge historical branches simply to recover features. Restore only capabilities that are still required and semantically valid in the current architecture.

---

## 11. Uncommitted / unpushed work

GitHub cannot represent local dirty work that has not been pushed.

When a task must stop before commit / push:

1. keep the chat update short;
2. state branch / HEAD / dirty status;
3. state the exact blocker / manual gate;
4. do not pretend GitHub reflects the uncommitted state;
5. use Drive or another explicit handoff only if uncommitted evidence must be shared across chats.

Once the checkpoint is safe to commit, update CURRENT and push the working branch when permitted.

---

## 12. CURRENT across old task branches

Some active task branches may predate these reporting files.

Do **not** merge, rebase, or otherwise alter production lineage merely to obtain documentation files.

Instead:

- read reporting rules from `main` / `origin/main` / GitHub;
- keep implementation work on the task's authorized lineage;
- if practical, add/update the lane CURRENT in the task branch as documentation only;
- Team SOL remains responsible for ensuring canonical CURRENT reflects the accepted checkpoint after review.

---

## 13. Role split

### Author

Owns:

- artwork judgment
- physical observation
- final author decisions
- short pointer relay between separate SOL / LUNA chats when needed

The author is **not** responsible for rewriting technical implementation instructions or long progress reports.

### SOL

Owns:

- architecture
- scope
- evidence interpretation
- next gate
- acceptance / rejection
- keeping CURRENT semantics correct
- writing / updating the bounded implementation instruction in GitHub
- giving the author a short explanation of what LUNA is being asked to do

### LUNA / Implementation SOL

Owns:

- reading the GitHub instruction before implementation
- bounded implementation
- tests
- artifacts
- checkpoint commit / push when permitted
- implementation facts in CURRENT where appropriate
- returning the compact SOL-review handoff

### Astra

Use primarily for:

- uncertain research questions
- alternative geometry / generative exploration
- high-level audits
- difficult architecture questions

Do not require Astra to write routine production status prose when the repo already contains the facts.

---

## 14. When a long report is still appropriate

Create a dedicated snapshot report only for meaningful boundaries such as:

- research round closure
- architecture decision
- first physical print
- migration / production-baseline lock
- major failure forensics
- full-practice audit
- competition / external handoff

These are checkpoint artifacts, not the everyday communication mechanism.

---

## 15. Keep the system lightweight

This reporting system itself must not become another project.

Rules:

- one stable CURRENT file per active lane
- one task spec only when detail is genuinely needed
- do not duplicate task specs into chat
- SOL chat explains briefly what / why / gate
- LUNA chat reports briefly what happened / evidence pointer
- author relays short messages only
- Git preserves history
- archive completed temporary implementation chats
- open a fresh temporary implementation chat only when a future bounded problem actually needs one
