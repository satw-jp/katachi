# SKIN Mini / MINIL Manufacturing Audit — 2026-10-09

Status: **AUDIT CHECKPOINT / HOLD / NOT PRINT CANDIDATE**

Purpose: make the current MINIL manufacturing state reviewable from GitHub without reconstructing it from chat. This document is an evidence/routing ledger, not a new fabrication result and not authorization to print.

## 1. Authority and fixed identities

- repo: `satw-jp/katachi`
- routing front: [SKIN_MINI_CURRENT](../status/SKIN_MINI_CURRENT.md)
- primary historical task: [Issue #36](https://github.com/satw-jp/katachi/issues/36)
- prior GitHub checkpoint: [Issue #36 comment 6031121569](https://github.com/satw-jp/katachi/issues/36#issuecomment-6031121569)

Frozen identities retained through the latest decomposition review:

| Item | Authority |
|---|---|
| Flower count | 2,303 |
| TARGET semantic SHA256 | `e48b2a1ca56d30e6d91a1f3bc14807e279b72be53b3501c6b1806926061df723` |
| Permanent members | 2,885 |
| Structure semantic SHA256 | `ed07e2e20226accbaf920e41e568ab74d9d3159c9ae32a53a5bde368c44014a4` |
| Main Permanent diameter | 2.2 mm |
| Print GO | false |
| Send / Start | NO / NO |

Issue #35 is an independent Large lane and was not modified by this audit.

## 2. Gate ledger

| Stage | Result | What it proves / does not prove |
|---|---|---|
| #33 surface replay | Author-accepted TARGET retained | fixes 2,303 Flower TARGET; does not prove fabrication |
| #36 Permanent replay lineage | geometry identity retained | static geometry/replay lineage; not Print GO |
| compact PERMANENT native representation | retained production base for one-piece path | fixes known PERMANENT receiver regression; does not fix all Flower/Support chronology |
| full one-piece major audit | 11 major mechanisms / 13 paths | identifies confirmed major fabrication blockers |
| batch physical-plan certification | 0/11 certified; 11/11 rejected | prior solid receiver/strut plans were not physically acceptable |
| final native Support routing | FAIL | at least L169/L225/L238 remained major floating Support |
| process-only route | EXHAUSTED | one-piece process-only correction is closed under current strategy |
| Candidate A two-part | FAIL assembly | exact split concept survives, rigid assembly does not |
| A+ minimal 3-part | FAIL main assembly | small third part is insufficient |
| A++ larger 3-part | all 3 candidates rejected | L2/L3 main pair can assemble; remaining Third cannot be inserted |
| 4-part modular | NOT STARTED | current recommended next candidate only |

## 3. One-piece fabrication closure

### 3.1 Major audit

The complete 782-layer audit found **11 confirmed major mechanisms / 13 actual paths**: Support 8 and Body 3.

Evidence:
- [COMPLETE_MAJOR_BLOCKER_AUDIT.md](https://drive.google.com/file/d/1Se3j-_Rw2ctOvaGy8CQACQ_K4CgWnYBB/view?usp=drivesdk)

The audit deliberately kept raw flags separate from confirmed physical blockers. It did not require strict-flag count zero.

### 3.2 Physical-plan certification

All eleven proposed physical plans were rejected at the pre-slice certification gate:
- L169 receiver: removability not certified;
- seven process struts: actual TARGET intersection / safe removable route failure;
- three Flower isolations: exact component partition passed, but required lower printable connection was not fully certified.

Evidence:
- [BATCH_PHYSICAL_CERTIFICATION.md](https://drive.google.com/file/d/1ilQUT4ooGjlRbu2agdzoJ1MmCAZK6Vp1/view?usp=drivesdk)

### 3.3 Final native Support routing attempt

A final bounded process-only candidate added local native Support controls and three exact Flower isolations, with geometry/settings locks preserved.

Slice:
- 782 layers
- exit 0
- approximately 69.72 minutes
- G-code SHA256 `4931f86c6f9c0811c4d1e17d56db4596c85efe4b9f065292723cff3103adb4e6`
- resolved settings SHA256 `eb6c922332544825497330fc2c377d0968f597fe1a382e136c8c97c6d41696d0`

Confirmed remaining major Support:

| Region | fully airborne path | coverage | minimum edge-gap lower bound |
|---|---:|---:|---:|
| L169 | 5.156 mm | 0% | 1.645 mm |
| L225 | 5.165 mm | 0% | 0.228 mm |
| L238 | 1.681 mm | 0% | 0.290 mm |

Retained PASS on that candidate included L17, L355, L5, the specified Flower regression sentinels, geometry/settings identity and Risk A physical plausibility.

Evidence:
- [PROCESS-ONLY EXHAUSTED STOP](https://drive.google.com/file/d/12Uv88DaSsxT0sfbxg8tdNULtEN7K60up/view?usp=drivesdk)

Result: **SKIN MINI TARGET PROCESS-ONLY FABRICATION ROUTE EXHAUSTED**.

## 4. Manufacturing decomposition chronology

### 4.1 R0 — choose a two-part architecture

R0 compared:
- A: 2 parts, internal SP004-center joint, jig — RECOMMENDED;
- B: same two parts with joint moved toward C0025 — VIABLE fallback;
- C: horizontal split — REJECTED because it creates many independent branches.

A/B allocate Flowers 1,371 / 932 and do not cut Flower surfaces. R0 checked CAD reconstruction and A1 mini bounding-box fit, but not real G-code, full assembly interference or adhesive strength.

Evidence:
- [MANUFACTURING_DECOMPOSITION_R0.md](https://drive.google.com/file/d/13UMRyEMPoDb_0BGM2l5QrorBhc089KpH/view?usp=drivesdk)

Author selected A.

### 4.2 A manufacturing preflight

Preflight corrected an R0 half-ownership error and five positive inter-part overlaps while retaining exact TARGET union and one connected group per repaired main part.

The corrected zero-gap final geometry still failed rigid assembly:
- proposed -X rail collides after 1 mm;
- an actual `R36A000858 / Flower00083` inside-solid witness exists;
- the local rigid contact constraint system produced motion cone = 0.

Evidence:
- [A_MANUFACTURING_PREFLIGHT.md](https://drive.google.com/file/d/1V0kBZR-nZgK9Dmi64M_DCbhzaWS2Glr1/view?usp=drivesdk)

### 4.3 A internal interface clearance

Three bounded assembly paths were evaluated. All still collide protected Flower solids, so internal-member clearance + AdhesiveFill cannot solve the assembly without changing protected Flower geometry.

Recorded local interference volumes:
- -X direct: 0.022920 mm^3;
- SP004-normal-derived: 0.053846 mm^3;
- contact-normal composite: 0.122353 mm^3.

No clearance / AdhesiveFill / coupon was adopted.

### 4.4 A+ minimal third part

Two minimal third-part options each used one Flower plus a distal attachment portion and were individually one connected group. Both failed because the main pair still contains `R36A000858 / Flower00083`.

Main obstruction:
- continuous -X 0–1 mm swept interference: 3.943523760 mm^3;
- positive overlap at 1 mm: 2.085473666 mm^3.

Evidence:
- [A_PLUS_MINIMAL_THIRD_PART.md](https://drive.google.com/file/d/1qQxjeMn6KgkITIBNNX9gDaC8R4iOdZDS/view?usp=drivesdk)

A+ was not adopted.

### 4.5 A++ bounded larger third part

Three candidates were reviewed:

| Candidate | Third | Flowers | Main assembly | Third insertion |
|---|---|---:|---|---|
| L1 | C0037 | 197 | FAIL | not run |
| L2 | Part2 minus C0048 | 806 | PASS, continuous -X 180 mm | FAIL |
| L3 | Part2 minus C0059 | 901 | PASS, continuous -X 180 mm | FAIL |

For L2/L3, the Third insertion failed for the allowed three directions and two assembly sequences because protected Flower-to-Flower interference remained.

Evidence:
- [A_PLUS_LARGER_3PART.md](https://drive.google.com/file/d/1ZBva1fYENKKjJM08oFeAR1pHsnqp6OaY/view?usp=drivesdk)

This is bounded candidate failure, not a mathematical proof that every possible 3-part decomposition is impossible.

## 5. Current manufacturing decision

Current state:

**HOLD / AUTHOR MANUFACTURING-STRATEGY DECISION REQUIRED**

Recommended next candidate:
**4-PART MODULAR ASSEMBLY**

Reason: L2/L3 already show a main pair that can translate continuously through the bounded -X assembly screen. The remaining failure is insertion of the large Third. The least-destructive next investigation is therefore to retain that main-pair structure and partition the non-insertable Third into two connected natural modules.

This recommendation is **NOT STARTED** and must not be read as Author authorization.

## 6. Closed / protected lanes

Do not resume by default:
- one-piece Support-routing iterations;
- PERMANENT index experiments;
- global support/settings sweeps;
- custom TARGET-intersecting solid struts;
- Candidate A zero-gap / internal-clearance repeats;
- A+ P1/P2 repeats;
- A++ L1/L2/L3 repeats;
- forced Flower bending / elastic assembly;
- whole-target orientation redesign.

Do not modify Issue #35.

## 7. Evidence package / integrity

GitHub Issue #36 already records the 2026-10-07 manufacturing checkpoint:
- [checkpoint comment](https://github.com/satw-jp/katachi/issues/36#issuecomment-6031121569)

Drive audit package:
- [CURRENT checkpoint](https://drive.google.com/file/d/12LVDoKjJY53FmLF5TzJw4CMAf3m8W97K/view?usp=drivesdk)
- [A++ comparison image](https://drive.google.com/file/d/1B4pr3XrgLcebV52OGETympQ27aB0YBz6/view?usp=drivesdk)
- [A–A++ evidence ZIP](https://drive.google.com/file/d/17B1Q_P5YSvq2JtWKF0AQyYvG9L-Im9nK/view?usp=drivesdk)
- [package manifest](https://drive.google.com/file/d/1t_MEBUZ1R-oYYATEPNDYrVfspinL6vA4/view?usp=drivesdk)

Recorded ZIP:
- 111 payload files
- 4,187,559 bytes
- SHA256 `16f538ce3ac56170cdad0485ce9c9b1e13c0355022fecc89fce3c74c84ad5de2`
- creation-time CRC and internal file SHA256 checks PASS

This package is a diagnostic/evidence snapshot, not a self-contained replay/print package.

## 8. Audit boundary

This checkpoint does **not** assert:
- fabrication PASS;
- joint/jig qualification;
- decomposition G-code;
- physical strength;
- physical PASS;
- Author artistic acceptance of a new manufacturing split;
- Print GO;
- printer send/start.

Resume from [SKIN_MINI_CURRENT](../status/SKIN_MINI_CURRENT.md), not from chat history.
