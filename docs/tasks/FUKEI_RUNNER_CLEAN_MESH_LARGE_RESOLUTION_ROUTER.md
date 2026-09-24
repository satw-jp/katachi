# FUKEI Runner Clean-Mesh / Large Resolution Router

Date: 2026-09-24 JST  
Status: READY FOR LUNA HANDOFF

## Purpose

The previous Large 3-flower diagnostic fixture repeatedly failed because a reduced/reconstructed Bambu project 3MF could parse while still resolving to an empty plate.

Work is now split into two independent tasks:

1. common Runner/input infrastructure
2. Large-specific 3-flower resolution comparison

Do not combine them into one implementation task.

## Task A — Runner / common infrastructure

GitHub Issue:

- #30 — FUKEI Slice Runner — Clean-Mesh Input Route v1
- https://github.com/satw-jp/katachi/issues/30

One-line LUNA handoff:

`satw-jp/katachi Issue #30 をtask authorityとして読み、記載scope内で実装・テストし、STOP条件まで実行してください。`

Expected terminal state:

`FUKEI RUNNER CLEAN-MESH INPUT ROUTE PASS`

No full Large slice.

## Task B — Large 3-flower comparison

GitHub Issue:

- #31 — Large A1 — 3-Flower Clean-Mesh Resolution Comparison
- https://github.com/satw-jp/katachi/issues/31

Dependency:

Issue #30 must first reach:

`FUKEI RUNNER CLEAN-MESH INPUT ROUTE PASS`

One-line Large LUNA handoff:

`satw-jp/katachi Issue #31 をtask authorityとして読み、Issue #30のPASSを確認後、記載scope内で実行し、STOP条件まで進めてください。`

Expected terminal state:

`LARGE RESOLUTION COMPARISON READY FOR AUTHOR REVIEW`

Do not select the final resolution automatically and do not full-slice Large.

## Responsibility boundary

- Author / decision owner: scope, acceptance, next gate
- Runner: execute / record
- Runner LUNA: implement common clean-mesh input route
- Large LUNA: build and execute the bounded Large diagnostic using that route

## Protected boundaries

Do not:
- return to reduced Bambu-project 3MF surgery for the diagnostic fixture
- mix MINIB send-metadata repair into these tasks
- print/send from either task
- treat software PASS as Physical PASS or Author ACCEPT
