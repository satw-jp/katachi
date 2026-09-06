# C — Single-Attachment Durability Audit v0

Date: 2026-09-06
Owner: C SOL
Implementation owner: C LUNA / bounded worker
Status: QUEUED — DO NOT START while FIELD vNext Interaction Correctness v0 is active unless C SOL reprioritizes

## Trigger

Post-First-Physical-Gate author handling produced a localized break: one appendage/subgraph that the author identifies as being supported by a single connection to the main artwork detached during casual play/handling. The detached subgraph itself remained substantially coherent; failure localized at the single-attachment connection. The author expects the mirrored/opposite-side analogue may share the same weakness.

This does not reopen the completed First Physical Print gate for print completion/support removal. It establishes a new physical durability weakness in the permanent artwork network.

## Purpose

Determine whether the current locked Permanent Graph contains single-edge / bridge-only appendages or equivalent one-connection subgraphs that correspond to the observed physical failure, without changing Production geometry or repair algorithms.

The first task is diagnostic/evidence-only. Do not automatically reinforce anything.

## Required audit

Using the locked current C fixture and Permanent Graph authority:

- Permanent Graph: 253 nodes / 272 edges / fingerprint `5cb659849d694beaae6443a4828031b5b6471b836bbe5e78aede5aece1c34435`
- Permanent BODY fingerprint: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`

identify:

1. graph bridges whose removal isolates a non-trivial terminal subgraph;
2. articulation nodes whose removal isolates a terminal appendage;
3. for each isolated appendage: node/edge count, approximate physical span/length, attachment degree, and motif IDs/provenance where available;
4. symmetric or near-symmetric candidates on the opposite side;
5. whether the observed broken piece is consistent with one of these candidates from available geometry/provenance evidence.

If the current graph representation cannot map this robustly to the physical piece, report that limitation rather than guessing.

## Protected scope

No changes to:

- Local Relay algorithm;
- bounded Graph-only repair;
- Permanent Graph;
- BODY generation/member sizing;
- motif placement/transforms;
- Support algorithm/source;
- Output Scale;
- FIELD;
- FKEI;
- Export;
- UI IA;
- research methods.

## Output

Produce a compact evidence package under `docs/evidence/` with:

- bridge/articulation appendage summary;
- candidate IDs/provenance;
- optional visualization data if existing tooling can emit it without source changes;
- recommendation classification only: `NO ISSUE`, `WATCH`, or `REINFORCEMENT TASK JUSTIFIED`.

Do not implement reinforcement in this task.

## Gate

C SOL reviews the audit and decides whether a separate bounded Permanent Structure reinforcement task is justified. Any actual geometry change requires a new task and fresh Production/physical gates.
