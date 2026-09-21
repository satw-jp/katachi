# Author Observation — A1 mini AMS lite Author-visible 3MF V2 raft restart

Recorded: 2026-09-21 JST

## Author report

The Author reported that the print started from `A1MINI_AMSLITE_AUTHOR_VISIBLE_3MFV2`, then noticed during printing that the actual job had **no raft**.

The Author:
1. stopped that print;
2. restarted the print afterward.

## Interpretation boundary

Treat these as **two separate physical execution attempts**.

### Attempt A — stopped
- source family: `A1MINI_AMSLITE_AUTHOR_VISIBLE_3MFV2`
- actual observation: no raft was present in the running print
- Author action: stopped the print
- physical verdict: **INVALID / NOT A PHYSICAL PASS**
- reason: the actual running job did not match the intended raft condition

Do not use Attempt A for PETG/PLA-interface quality comparison, Support-removal judgment, or process acceptance.

### Attempt B — restarted
- source family: `A1MINI_AMSLITE_AUTHOR_VISIBLE_3MFV2`
- state: **RESTARTED / RUNNING or result pending**
- exact restarted payload / actual raft count / printer-side overrides: **not yet independently bound in this record**

The restart must not be silently treated as the same execution as Attempt A.

## Important discrepancy

The V2 package/intended condition included raft, but the Author observed no raft in the actual first running print.

This is an observed **intended-setting vs actual-sent-job discrepancy**. Do not assign a cause yet. Possible locations include editable-3MF project settings, Bambu Studio reslice/settings state, or send-time configuration, but none is proven by this observation alone.

The next physical review should bind the restarted job's actual conditions before using it as evidence.

## Protected scope

- no geometry redesign from this observation alone;
- no Runner blame;
- no Phase C implication;
- no Production/generalization claim.
