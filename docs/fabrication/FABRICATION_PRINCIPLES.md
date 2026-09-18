# Fabrication Principles

Version: 0.1. Recorded: 2026-09-19. Owner: Fabrication SOL; artistic and physical gates remain Author-owned.

These are SKIN/R4 operating and artistic constraints with bounded evidence, not universal manufacturing laws. Source-specific observations, chosen operating rules and software claims must remain distinguishable.

Sources: [TEAM_PROTOCOL_CORE](../TEAM_PROTOCOL_CORE.md), [SKIN_ABC_CURRENT](../status/SKIN_ABC_CURRENT.md), the retained R2 evidence in [ASTRA_CURRENT at the inspected checkpoint](https://github.com/satw-jp/katachi/blob/9f6c607100c25cdfc780377002839726fde044b8/docs/status/ASTRA_CURRENT.md), and the [2026-09-18 Author fabrication instruction](../observations/AUTHOR_OBSERVATION_R4_A1_FABRICATION_2026-09-18.md).

## FAB-01 — Protect the artwork, localize fabrication changes

SHAPE / FLOWER / Void / composition are not free parameters for a fabrication worker. Freeze the case's accepted input identities, physical scale, placement/orientation and relationships before diagnosing print issues. A limited structure/Support task does not reopen motif research or composition.

Identify which branch roles, dimensions or contact endpoints a change affects. An exception must be explicit; a convenient uniform rule must not silently remove a protected bed-contact/root condition.

## FAB-02 — Structure should support, not replace, the visual subject

Retained R2 Author review established the preference to **avoid visible structural flower-to-flower surface-horizontal bars; prefer flower-back/root -> internal structure**. Preserve this as an artistic/design principle, not a proof that one graph is always stronger or printable.

Transfer the principle across shapes only after checking semantic fit. Do not transfer old world coordinates, branch counts, specific Support placements or a truss template as an automatic standard.

## FAB-03 — Authored Support is not slicer automatic Support

Track permanent artwork/structure, authored removable Support geometry, and slicer-generated automatic Support as different roles. Record them separately in candidate locks, manifests and review.

Automatic Support OFF can coexist with substantial authored Support in the input geometry. A slicer warning or a field named `support` does not authorize turning automatic Support ON, deleting authored Support or conflating it with permanent structure.

Retain the Author's accepted bottom-Support policy. A bounded contact repair is not blanket permission to expand Support. Removal effects, unintended fusion and physical strength remain distinct questions after geometric contact is restored.

## FAB-04 — Diagnose first; avoid global compensation

Use authority -> physical evidence -> mechanism separation -> minimal bounded change -> native slice -> toolpath audit -> Author Gate.

Do not use global densification, global thickening, blanket Support, global slowing or Artwork redesign as the first reflex. Connect each proposed change to a localized supported mechanism; preserve alternative explanations and unverified causes.

The retained R4 investigation separates adhesion, starvation/clog, collision/shift/vibration, local collapse, thermal/cooling effects, speed/acceleration, unsupported birth, feed resistance and slicer classification. A no-clog observation in one interval is bounded evidence, not proof that all extrusion/physical failure mechanisms are excluded.

## FAB-05 — Conditions are bounded physical evidence

A temperature, plate choice, retraction setting, support contact size or print mode belongs to its observed machine/material/candidate/interval. Do not promote the R4 240 C baseline into a general PLA recommendation or overwrite it with a generic default.

Keep intended profile, effective emitted settings, manual interventions and measured physical observations separate. Record rather than conceal GUI/CLI differences. Do not infer failure Z from clock time or M73 when execution timing has changed; use [AUD-05](TOOLPATH_AUDIT_RULES.md#aud-05--local-growth-collision-and-failure-band-review).

## FAB-06 — Keep evidence and approval separate

Report independent states for input preservation, native execution, file integrity, geometric contacts, chronological/supportability audit, physical outcome, Author artistic judgment and printing permission.

```text
complete G-code != complete toolpath audit
static contact != chronological supportability
software PASS != physical PASS != Author artistic ACCEPT
Research reproducible != SKIN reproducible != Generalizable
```

File/folder names such as FINAL, CLOSURE or PRINT_CANDIDATE do not confer approval. Neither worker success nor documentation publication grants permission to send a job to a machine. Stop at the named Author gate.

## FAB-07 — Three layers, explicit ownership

| Layer | Owns | Must not become |
|---|---|---|
| CURRENT | Current scope/candidate, evidence state, blockers, next entry action, gate and pointers | A growing procedural diary or a second copy of every rule |
| PLAYBOOK / RULES | Versioned steps, applicability, constraints, expected evidence, limitations and stop conditions | A collection of unqualified success claims or hardcoded one-off case defaults |
| SKIN | Future bounded execution of selected proven procedures, with evidence emitted for each run | The only knowledge store, an autonomous artwork-repair system or an implicit print approval path |

Raw attempts, locks, geometry, G-code and physical evidence remain durable sources behind these layers. The three-layer design does not replace the GitHub/Drive source split or make a fourth competing authority.

Normal restart: CURRENT -> bounded task -> relevant Playbook/rules -> named input/evidence locks. Read current identity and completed steps before acting. An applied repair must be verified and reused, not automatically applied again.

## FAB-08 — Retention and promotion

At each safe checkpoint, the lane owner updates CURRENT, preserves exact attempt/artifact identity and writes the next entry action. A reusable discovery also updates the relevant stable Playbook section with **rule ID, applicability/version, source evidence, verification level, limitations and stop condition**. Do not leave durable knowledge only in a chat or a dated handoff.

Preserve these distinctions when promoting knowledge:

- **Author rule / required procedure**: a constraint or required check, not an empirical capability PASS.
- **Observed / demonstrated once**: the named source supports a bounded execution/result; repetition or broader applicability remains unverified.
- **Repeated / bounded verified**: attach actual matching runs/checks and their scope. Do not infer this from a successful sample or a prepared script.
- **Not implemented / unverified**: retain the requirement visibly rather than silently returning PASS.

The immediate order is CURRENT -> retained Playbooks -> completion/review of D22.1 final slice and audit -> selective SKIN translation. Playbook publication can preserve a required audit before its implementation is proven. It does not itself promote that audit to validated capability.

Before any SKIN Fabrication Core work, SOL/Author must select a bounded proven part, specify its input/output contract, preserve source/reproduction evidence and define acceptance/negative tests. Follow [Capability Retention](../protocol/CAPABILITY_RETENTION.md); do not bulk-integrate old AB/C or Research scripts.

A future interface such as `skin fab slice` is **a proposal, not an implemented command**. Its intended role is to orchestrate authority/profile locks -> recorded native mapping/engine -> saved G-code -> ZIP/hash/integrity -> explicit audit coverage -> review package. Machine send/print and additional geometry repair remain outside that implicit chain. A missing audit, unresolved required risk or missing Author GO cannot be converted into a printable release.

To make the future executor restart-safe, bind each stage to exact input/output hashes and rule/tool revisions, preserve attempt records, and verify existing completed work before rerunning it. Those are implementation requirements for a later bounded task, not claims that the current scripts enforce them.
