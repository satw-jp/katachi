# OPT-1c Evidence Manifest

This directory stores the empty manifest contract for the OPT-1c acceptance gate. Evidence must be collected under a full candidate commit SHA and one acquisition session:

```text
docs/hikari/evidence/opt-1c/<candidate-sha>/<YYYYMMDD-HHMM>-m4mba/
```

Copy `manifest.template.json` into that directory as `manifest.json`; do not edit the template in place. Evidence from different candidate commits or sessions must never be combined.

The authoritative thresholds, artifacts, and decision rule are in [`../../master-plan.md`](../../master-plan.md#8-opt-1c-evidence-manifest). Their detailed implementation source is [`../../r1-optical-observation-implementation-handoff.md`](../../r1-optical-observation-implementation-handoff.md).

## Current hold

On 2026-08-03, the author approved the exact SSOT-0 Natural procedure only: `baseline`, `candidate-absent`, and `candidate-on`; four `safe=0/1` comparisons (`baseline` vs `candidate-absent`, then `candidate-absent` vs `candidate-on`); maximum channel difference `<= 1/255`; different pixel ratio `<= 0.001`; candidate-absent resource non-generation; zero console errors; and evidence fixed to one full candidate SHA and acquisition session. The template records this as `authorApproval.naturalThreeStateFourPairProcedure: APPROVED`.

This procedure approval does not accept OPT-1c, make SSOT-0 GO, or authorize GLOW-A1. OPT-1c capability, pixels, captures, performance, automated evidence, independent verification, fresh review, and author acceptance remain `HOLD` until evidence for one candidate/session satisfies the manifest.

If a limited OPT-1c fix creates a new candidate commit, preserve the old evidence as `superseded` and collect the full evidence set again under the new SHA.
