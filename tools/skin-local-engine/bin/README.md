# Reviewed CUDA executable

`katachi-containment-cuda.exe` is the shadow-only persistent worker built from
the checked-in `../native` source. Its CUDA kernel PTX and original contract
come from:

- repository: `satw-jp/katachi-cuda-rtx3080-bringup`
- commit: `205b69e58d3b4d99e07151ee76670b8b2ed496ed`
- original source path: `src/main.cpp` and `src/containment_kernel.ptx`
- current SHA-256: `32D62914ABA976639D125E0336E4298C5AA7F316DCB9A1C6664016F4B42C8ACA`

The helper launches only this sibling filename. No HTTP request field can
select an executable path or command. The adapter additionally requires the
RTX 3080, float32, containment algorithm v1, `shadow: true`, and
`productionApplied: false` contracts before advertising the backend.

The worker adds fixed `--worker-framed` and compatibility
`--worker-framed-json` modes with a 16-byte length-prefixed `KCF1` frame.
Framed JSON remains available for reference/debug use; compact binary uses
separate frame kinds as a performance candidate. The one-shot capabilities and
JSON evaluation modes remain available for review and diagnostics.
