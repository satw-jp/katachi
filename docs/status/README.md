# Current Status SSOT

This directory contains compact, current-state pointers for active implementation-facing lanes.

Read first:

- `../TEAM_REPORTING_RULES.md`

Recommended stable files:

- `SKIN_ABC_CURRENT.md`
- `ASTRA_CURRENT.md`
- [R4_A1_FAB_CURRENT.md](R4_A1_FAB_CURRENT.md) — retained Large R4 / D22.1 bounded A1 fabrication lane
- [R5_SLICE_RUNNER_CURRENT.md](R5_SLICE_RUNNER_CURRENT.md) — FUKEI Slice Runner execution infrastructure and reproducibility boundary
- [A1MINI_AMSLITE_PHYSICAL_CURRENT.md](A1MINI_AMSLITE_PHYSICAL_CURRENT.md) — current A1 mini PETG+PLA physical evidence and dry-only test
- `AB_CURRENT.md`
- `C_CURRENT.md`
- `HANA_CURRENT.md`
- `ART_CURRENT.md`

Each active lane owns its own `*_CURRENT.md` and updates it at safe pushed checkpoints.

Do not create a new status report for every task. Update the stable CURRENT file and let Git history preserve previous states.

A CURRENT file is a pointer to evidence, not a substitute for evidence.

## Active implementation visibility

For any non-trivial implementation task, `*_CURRENT.md` must show the current bounded instruction in an `Active implementation instruction` section. At minimum it must state:

- who is implementing it;
- what task is being implemented;
- why it is being done now;
- what may change;
- what must not change;
- what exact gate ends the task.

The purpose is transparency: the author should be able to ask “what is this team implementing right now?” and get the answer from GitHub without reading the implementation chat.

For a complex task, keep CURRENT compact and link to a dedicated `docs/tasks/...` specification. Do not paste a large implementation prompt into CURRENT.

When work is still local / dirty / unpushed, report that briefly in chat and do not claim the GitHub CURRENT reflects it.

## Fabrication knowledge routing

CURRENT records where the lane is now. The bounded task defines the permitted next work. Durable procedures and constraints live in [A1_BAMBU_CLI_RUNBOOK](../fabrication/A1_BAMBU_CLI_RUNBOOK.md), [TOOLPATH_AUDIT_RULES](../fabrication/TOOLPATH_AUDIT_RULES.md) and [FABRICATION_PRINCIPLES](../fabrication/FABRICATION_PRINCIPLES.md).

Normal fabrication restart is CURRENT -> task -> relevant Playbook sections -> exact Drive locks/evidence. Do not duplicate whole procedures in multiple CURRENT files. Record completed steps and the next entry action so another agent does not repeat geometry repair or launch duplicate work.

Playbook publication does not mean the procedure is implemented or physically proven. A later SKIN executor may implement only separately selected and validated procedures; printing and artistic/physical acceptance remain explicit Author gates.
