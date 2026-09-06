# CURRENT Format Reference

Use this fixed front order for active lane CURRENT files:

1. Authority
2. NOW / Current phase
3. Active task
4. Blocker
5. Next gate
6. Protected
7. Required pointers
8. separator
9. retained context / evidence pointers / historical details

The first roughly 50–100 lines should answer normal resume/review questions where practical. This is a routing layer, not a hard truncation rule. Retain useful rationale below the separator and link external evidence rather than duplicating it.

## Standard task header

```text
## Required reading
1. this task
2. relevant CURRENT front section
3. named code / evidence pointers

## Do not preload
- STATEMENT.md
- RESEARCH.md
- other lane CURRENTs
- old tasks
- broad architecture / research docs

If a concrete dependency arises, load only the needed source and report why.
```

Use `Do not preload`, not `Do not read`. Task-specific protected scope, exact done criteria, and named evidence pointers remain in the task.
