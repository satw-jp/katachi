# Hikari Reference

Before reading, editing, testing, or starting Hikari work, run `node scripts/verify-hikari-current.mjs` in the authorized Hikari worktree and treat its reported version, branch, commit, and worktree as authoritative. If the result is ambiguous or inconsistent, stop until Hikari authority is resolved; do not fall back to an older copy.

Before presenting a localhost runtime as current, also run `node scripts/verify-hikari-current.mjs --runtime` and confirm the displayed version matches. This gate is Hikari-specific and is not a default preload for unrelated workers.
