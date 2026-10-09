# SKIN Mini / MINIL — CURRENT

Last verified: 2026-10-09 JST

## Authority

- repo: `satw-jp/katachi`
- branch: `main`
- relevant Issue: [#36 SKIN Mini TARGET Internal Structure Replay v0](https://github.com/satw-jp/katachi/issues/36)
- accepted surface authority: Issue #33 / 2,303-flower TARGET
- detailed manufacturing audit: [SKIN_MINI_MANUFACTURING_AUDIT_2026-10-09](../evidence/SKIN_MINI_MANUFACTURING_AUDIT_2026-10-09.md)
- Drive checkpoint / evidence package: [CURRENT checkpoint](https://drive.google.com/file/d/12LVDoKjJY53FmLF5TzJw4CMAf3m8W97K/view?usp=drivesdk), [A–A++ evidence ZIP](https://drive.google.com/file/d/17B1Q_P5YSvq2JtWKF0AQyYvG9L-Im9nK/view?usp=drivesdk)
- publication base inspected while writing this CURRENT: `3437d964792ff717c2181cebfb84f8574c95eded`

GitHub is technical authority for routing and gate state. Drive retains the large generated/evidence packages. If this CURRENT conflicts with a later Issue comment or later pushed CURRENT update, use the later explicit authority.

## NOW / Current phase

**HOLD / NOT PRINT CANDIDATE / AUTHOR MANUFACTURING-STRATEGY DECISION REQUIRED.**

The accepted 2,303-flower TARGET and regenerated Permanent are frozen. The one-piece process-only fabrication route is exhausted: a final 782-layer production-context slice still contained confirmed major floating Support at L169, L225 and L238. The manufacturing strategy was therefore changed from one-piece fabrication to exact subassembly decomposition.

Candidate A two-part decomposition was selected and geometrically repaired, but rigid assembly is not feasible under the protected Flower geometry. Minimal A+ three-part and bounded larger A++ three-part decompositions also failed assembly/insertion gates. A++ L2/L3 preserve a useful result: their two main parts pass a continuous -X 180 mm main assembly screen, while the remaining Third cannot be inserted by the bounded three paths / two sequences because protected Flower solids collide.

**Next candidate is 4-PART MODULAR ASSEMBLY. It is NOT STARTED and is not yet Author-authorized by this CURRENT.**

Current gate separation:

| Gate | State |
|---|---|
| Frozen TARGET geometry | PROVEN / unchanged |
| Frozen Permanent structure identity | PROVEN / unchanged |
| One-piece process-only fabrication | EXHAUSTED / FAIL |
| Candidate A rigid 2-part assembly | FAIL |
| Candidate A+ minimal 3-part | FAIL |
| Candidate A++ bounded larger 3-part | FAIL |
| 4-part modular assembly | NOT STARTED |
| fabrication PASS | HOLD |
| physical PASS | NOT TESTED for decomposition candidates |
| Author artwork ACCEPT | not changed by this record |
| Print GO | false |
| printer send | NO |
| print start | NO |

## Active task

**NONE.**

No implementation task is active from this CURRENT. The bounded next manufacturing strategy must be selected by the Author before work starts.

Recommended next candidate from the latest bounded review:

`4-PART MODULAR ASSEMBLY`

The intended reuse boundary is: keep the A++ L2/L3 main-pair evidence where ownership remains unchanged, and split the non-insertable Third into two connected natural modules. This is a recommendation / next candidate, not an authorization or PASS.

## Blocker

Protected Flower geometry creates rigid-body interlocks during assembly.

Latest bounded A++ results:

| Candidate | Third | Third Flowers | Main rigid assembly | Third insertion |
|---|---|---:|---|---|
| L1 | C0037 subtree | 197 | FAIL | not evaluated |
| L2 | Part2 minus C0048 | 806 | PASS: continuous -X 180 mm | FAIL: 3 paths x 2 sequences |
| L3 | Part2 minus C0059 | 901 | PASS: continuous -X 180 mm | FAIL: 3 paths x 2 sequences |

The L2/L3 main PASS is a bounded geometric sweep result, not fabrication PASS, jig PASS, joint PASS, or physical PASS.

Earlier A/A+ interlock evidence remains retained:
- zero-gap A has rigid motion cone = 0;
- bounded A clearance paths still collide Flower-to-Flower;
- A+ P1/P2 leave the separate `R36A000858 / Flower00083` main obstruction;
- forcing Flower elastic deformation is not accepted.

## Next gate

Author chooses whether to start **4-PART MODULAR ASSEMBLY**.

If authorized, the bounded task must:
1. retain the accepted TARGET, corrected ownership, and protected Flower geometry;
2. start from A++ L2/L3 only, not L1;
3. keep the already-passable main pair when ownership is unchanged;
4. partition the non-insertable Third into two connected natural modules using the saved interlock graph;
5. prove main assembly, Module3 insertion, Module4 insertion, order, mutual collision, exact reconstruction, hidden joint access and jig access before any slice;
6. STOP for Author review before production slicing.

Do not auto-start 5+ parts, elastic assembly, whole-target orientation redesign, or new process-only Support/index work if bounded 4-part candidates fail.

## Protected

Do not change without a new explicit Author decision:

- 2,303 accepted Flower instances / placement / Flower geometry;
- TARGET semantic SHA256: `e48b2a1ca56d30e6d91a1f3bc14807e279b72be53b3501c6b1806926061df723`;
- Structure semantic SHA256: `ed07e2e20226accbaf920e41e568ab74d9d3159c9ae32a53a5bde368c44014a4`;
- original Permanent member count: 2,885;
- main Permanent diameter: 2.2 mm;
- corrected SP004 half assignment;
- R36A000858 / SP002 ownership repair;
- visible Flower surfaces;
- Issue #35 Large lane: **do not modify, merge, or import its Large-only patches**;
- `print_go=false`, printer send NO, print start NO.

Also closed for the current manufacturing strategy unless explicitly reopened:
- PERMANENT index/representation experiments;
- global Support parameter sweeps;
- one-blocker-at-a-time process-only fixes;
- custom intersecting solid struts;
- forced elastic Flower assembly.

## Required pointers

Read in this order for MINIL resume/review:

1. [this CURRENT](SKIN_MINI_CURRENT.md)
2. [manufacturing audit](../evidence/SKIN_MINI_MANUFACTURING_AUDIT_2026-10-09.md)
3. [Issue #36 latest checkpoint comment](https://github.com/satw-jp/katachi/issues/36#issuecomment-6031121569)
4. [Drive CURRENT checkpoint](https://drive.google.com/file/d/12LVDoKjJY53FmLF5TzJw4CMAf3m8W97K/view?usp=drivesdk)
5. [A++ larger 3-part report](https://drive.google.com/file/d/1ZBva1fYENKKjJM08oFeAR1pHsnqp6OaY/view?usp=drivesdk)
6. [A–A++ evidence ZIP](https://drive.google.com/file/d/17B1Q_P5YSvq2JtWKF0AQyYvG9L-Im9nK/view?usp=drivesdk)
7. [AGENTS.md](../../AGENTS.md)
8. [TEAM_PROTOCOL_CORE](../TEAM_PROTOCOL_CORE.md)

Do not preload Issue #35 or unrelated SKIN lanes. Read them only for a concrete dependency / boundary check.

---

## Retained evidence summary

### Frozen geometry

- FLOWER count: 2,303.
- natural components: 2,107.
- Permanent members: 2,885.
- retained role counts include ROOT_ADDITION 2, SHARED_CORE 95, INTERNAL_SPATIAL_LINK 9.
- accepted placement and structure semantic hashes are listed above.

### Process-only route

The final native-Support-routing candidate used local Support controls plus three exact Flower isolations without changing TARGET / Structure. The 782-layer slice completed normally, but at least three major Support starts remained completely unreceived: L169, L225 and L238. That result closed the process-only route and triggered the manufacturing-decomposition decision.

### Decomposition route

- R0: A/B two-part candidates; A recommended and then selected. Horizontal C rejected.
- A preflight: R0 half ownership error and five inter-part overlaps corrected while retaining TARGET union and one connected group per part. Zero-gap rigid assembly remained constrained; -X already collided at 1 mm.
- A internal-clearance review: all three bounded paths still had protected Flower-to-Flower collisions; internal-member clearance could not solve them.
- A+ minimal third part: P1/P2 each produced one connected small third branch but main assembly still failed because `R36A000858 / Flower00083` remained in the main parts.
- A++ larger third part: L1 main FAIL. L2/L3 main PASS but Third insertion FAIL across bounded paths and orders. No candidate adopted.

No decomposition candidate has been production sliced. No decomposition candidate has fabrication PASS, physical PASS, or Print GO.
