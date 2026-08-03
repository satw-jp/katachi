# OPT-1c Evidence Manifest

This directory stores the empty manifest contract for the OPT-1c acceptance gate. Evidence must be collected under a full candidate commit SHA and one acquisition session:

```text
docs/hikari/evidence/opt-1c/<candidate-sha>/<YYYYMMDD-HHMM>-m4mba/
```

Copy `manifest.template.json` into that directory as `manifest.json`; do not edit the template in place. Evidence from different candidate commits or sessions must never be combined.

The authoritative thresholds, artifacts, and decision rule are in [`../../master-plan.md`](../../master-plan.md#8-opt-1c-evidence-manifest). Their detailed implementation source is [`../../r1-optical-observation-implementation-handoff.md`](../../r1-optical-observation-implementation-handoff.md).

## Current hold

The Natural three-state procedure and four comparison pairs are a proposed SSOT-0 procedure. `authorApproval.naturalThreeStateFourPairProcedure` must remain `HOLD` until the author explicitly approves it. Draft PR publication does not satisfy this approval and does not accept OPT-1c.

If a limited OPT-1c fix creates a new candidate commit, preserve the old evidence as `superseded` and collect the full evidence set again under the new SHA.
