# SKIN / HANA authoring bridge

Status: design-only candidate boundary; no runtime connection is authorized

```text
HANA
author draws
Gesture / Stroke / Graph
        ↓
SKIN
establishes structure
Web / Support / Print
```

HANA does not replace SKIN production geometry. SKIN does not become a HANA-only application. HANA is both a standalone 3D Drawing Instrument and a potentially embeddable authoring capability.

In a future boundary, SKIN may accept HANA-authored Stroke, Graph, or author intent as one kind of backend-neutral input:

```text
HANA author input
hana / arbitrary strokes / motifs
        ↓
SKIN geometry pipeline
        ↓
Web
        ↓
Support
        ↓
Validation
        ↓
Print
```

This is a design warning against specializing future Support or Web contracts to the current 38 Motifs when a more general authored Stroke/Graph input may later exist. It is not a request to generalize, refactor, or change the current algorithms now.

The present boundary is strict:

- no HANA-to-SKIN runtime import;
- no production geometry replacement;
- no FKEI schema change;
- no Support, Web, Validation, Print, CUDA, or deployment change;
- no claim that HANA is a current production input.

Platform-specific execution belongs behind the boundary. Authored Gesture/Stroke/Graph data should remain independent of Windows Browser, iPad Native, CPU, WebGPU, or CUDA implementations.

See `docs/hana/research-direction-20260901.md` for the wider research direction.
