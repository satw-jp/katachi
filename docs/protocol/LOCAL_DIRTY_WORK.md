# Local Dirty Work Reference

GitHub cannot represent local changes that are not pushed. When work is dirty or unpushed:

1. do not clean, reset, stash, overwrite, or silently discard it;
2. record exact path, branch, HEAD, dirty/untracked state, and broad content type;
3. state whether the state is active, expected, or owner-ambiguous;
4. identify the exact preservation action or blocker;
5. never claim GitHub reflects the local state;
6. use an explicit external handoff only when uncommitted evidence must cross chats.

Do not switch, repair, prune, or recreate linked worktrees without explicit authorization. Preserve old paths until a verified replacement exists.

Do not merge, rebase, or otherwise alter an old task branch merely to obtain reporting or governance documents. Read those documents from `main` / `origin/main` / GitHub and keep implementation work on its authorized lineage.
