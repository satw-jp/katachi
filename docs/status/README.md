# Current Status SSOT

This directory contains compact, current-state pointers for active implementation-facing lanes.

Read first:

- `../TEAM_REPORTING_RULES.md`

Recommended stable files:

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
