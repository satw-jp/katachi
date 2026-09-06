# ART Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- canonical status: `main:docs/status/ART_CURRENT.md`
- Research Principle checkpoint lineage is remote and verified:
  - Round 01: `agent/skin-art-research-principles-r1` @ `e9932d05b701ee1bd2ae8e19501d7d7a33927b06`
    - route: `/skin-art/research-principles/`
    - inventory: 5 studies
  - Round 02: `agent/skin-art-research-principles-r2` @ `592ab0123358c63fc75c1acc7e6df408be40b89c`
    - descends from Round 01
    - route: `/skin-art/research-principles-r2/`
    - inventory: 3 studies: `MULTI RECONNECT`, `MOTIF–TENSION`, `RELAX / REWIRE`
  - Round 03: `agent/skin-art-research-principles-r3` @ `5edc19f310000354943ffb2e1fafc8eaff089e13`
    - direct child of Round 02 HEAD
    - route: `/skin-art/research-principles-r3/`
    - inventory: 1 integrative study: `REDUNDANT FREEFORM MORPHOGENESIS`
- latest implemented checkpoint for ART review: Round 03 HEAD above
- local working-tree state is not represented by this remote verification.

## Current phase
Research Principle Studies are implemented through Round 03. The previous bootstrap statement that ART is still implementing the "first 3 studies" is superseded by the verified checkpoint inventory above.

ART is currently at an **AUTHOR REVIEW / ARTISTIC GATE**. No new implementation task is active. **Round 04 is not authorized.**

ART remains an independent generative / interactive / audiovisual artwork environment, not a SKIN presentation layer or scientific visualizer.

## Active implementation instruction
- owner: NONE — author review gate
- task: do not start Round 04 or another implementation expansion
- purpose: judge the already implemented studies before deciding any next bounded ART task
- allowed scope: read-only review, launch/capture of existing R1/R2/R3 studies, evidence inspection, and CURRENT correction if review changes the accepted state
- protected scope: no new morphology study, no SKIN/HANA integration, no production-wide ART rewrite, no naturalistic morphology imitation as objective, no optimization toward support / shortest path / minimum material
- done when: author gives the next artistic judgment; ART SOL then records ACCEPT / REJECT / HOLD and only then may define a new bounded task
- instruction source: this CURRENT; no separate implementation task is active

## PASS / CLOSED
### Round 01 — baseline principle studies
- remote checkpoint verified: `e9932d05b701ee1bd2ae8e19501d7d7a33927b06`
- five studies exist: path adaptation, anastomosis, constrained relaxation, neighbor exchange, coarsening.
- deterministic replay / principle-specific behavior is represented in the Round 01 test suite.
- author review completed; several studies were useful as conceptual baselines, while `USE / FORGET` and `SCALE SHIFT` were not sufficiently legible and were not promoted as the main direction.

### Round 02 — three review studies
- remote checkpoint verified: `592ab0123358c63fc75c1acc7e6df408be40b89c`
- exactly three studies are implemented in the Round 02 selector:
  - `R2-01 MULTI RECONNECT`
  - `R2-02 MOTIF–TENSION`
  - `R2-03 RELAX / REWIRE`
- the route provides play/restart, per-study controls, phase readouts, PNG frame capture, JSON manifest capture, and WebM recording support.
- source tests specify multiple reconnection / cycle formation, fixed-topology tension relaxation, one discrete rewire event, and deterministic replay where applicable.
- author review completed:
  - `MULTI RECONNECT` was visually strong and motivated the move toward expressive redundancy rather than explicit support-efficiency meaning.
  - `MOTIF–TENSION` made the need for richer multi-point / spatial behavior apparent; tension was less visually legible than desired.
  - `RELAX / REWIRE` made the tension → topology event → redistributed relaxation relation legible.

### Round 03 — redundant freeform morphogenesis checkpoint
- remote checkpoint verified: `5edc19f310000354943ffb2e1fafc8eaff089e13`
- implementation is isolated under the R3 route and retains R1/R2 routes.
- static SOL review supports alignment with `Redundancy as expressive freedom`:
  - multiple origins rather than a single root
  - weak directional / density / path influences
  - local reconnection adds edges without deleting old routes
  - cycles and dead ends are allowed to remain
  - construction history / residue is retained
  - relaxation is bounded around reconnection events rather than applied as a global optimization field
  - deterministic fixed-step replay is explicitly tested
- no code evidence was found for shortest-path optimization, minimum-material optimization, automatic pruning, or global smoothing.

## Current blocker
- no implementation blocker is recorded.
- Round 03 **artistic acceptance is UNVERIFIED** until author review.
- GitHub contains the R1/R2/R3 test source, but this review found no GitHub Actions / commit-status evidence proving the test suites or full TypeScript/Vite build were executed at these remote HEADs.
- capture / manifest functionality is implemented, but generated review captures are not canonical repo evidence at this checkpoint.

## Next gate
**AUTHOR REVIEW — STOP HERE. Do not start Round 04.**

Primary review target: Round 03 `/skin-art/research-principles-r3/` in the context of the accepted lessons from the three Round 02 studies.

Author judges:
- does R3 read as freeform rather than tree / support structure?
- does it read as generated history rather than random spaghetti?
- are loops, reconnects, dead ends, and residue visually valuable?
- does local relaxation preserve irregularity rather than over-clean the form?
- should the underlying structural principles become stronger, weaker, or remain mostly hidden?
- is the form itself worth continuing to watch / develop?

After that judgment, ART SOL records `ACCEPT / REJECT / HOLD` and decides whether any next bounded task exists.

## HOLD / DO NOT CHANGE
- **no Round 04 before author review**
- no final ART artwork selection yet
- no production-wide ART rewrite
- no SKIN / HANA integration expansion
- no naturalistic spider-web / leaf-vein / bone / foam / root imitation as the goal
- no support-efficiency, shortest-path, minimum-material, or global-stiffness objective
- no automatic pruning of redundant routes or dead ends
- preserve the R1 / R2 / R3 checkpoint branches as review history

## Relevant artifacts
- R1 route: `/skin-art/research-principles/`
- R2 route: `/skin-art/research-principles-r2/`
- R3 route: `/skin-art/research-principles-r3/`
- R1 tests: `src/studies/skin/research-principles/researchPrinciples.test.ts`
- R2 tests: `src/studies/skin/research-principles-r2/researchPrinciplesR2.test.ts`
- R3 tests: `src/studies/skin/research-principles-r3/researchPrinciplesR3.test.ts`

## Evidence boundary
### PASS / PROVEN from remote GitHub
- R1 / R2 / R3 branches exist at the exact HEADs listed above.
- checkpoint lineage is R1 -> R2 -> R3.
- R1 contains five baseline studies; R2 contains exactly three focused studies; R3 contains one integrative redundant-freeform study.
- all three routes are registered in the latest R3 Vite configuration.
- model/test source supports the behavioral distinctions summarized above.

### SUPPORTED but not execution-proven in this review
- the test suites are designed to verify the intended deterministic and topology / relaxation behavior.
- existing UI/capture code is sufficient in structure for an author-review instrument.

### UNVERIFIED / NOT YET ACCEPTED
- actual current browser execution / capture on the author's machine in this review
- test/build PASS at the remote HEADs via CI or recorded command output
- Round 03 artistic acceptance
- whether any Research Principle should enter a final ART production language
