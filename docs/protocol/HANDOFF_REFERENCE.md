# Handoff Reference

Use this minimum completion handoff:

```text
<review owner> review用:

実施: <what changed, 1–3 lines>
branch: <branch>
commit: <sha or NO COMMIT>
CURRENT/task status: <path / updated or not>
tests: <short result>
artifact/gate: <short result>
blocker: <NONE or one line>

Review owner / AuthorはGitHubのCURRENT / task spec / commit evidenceを読んでreviewしてください。
```

If work stops before commit or push, state `local / dirty / unpushed` and the exact blocker or manual gate. A handoff is evidence input, not acceptance.
