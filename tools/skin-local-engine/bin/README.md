# Reviewed CUDA executable

`katachi-containment-cuda.exe` is the shadow-only persistent worker built from
the checked-in `../native` source. Its CUDA kernel PTX and original contract
come from:

- repository: `satw-jp/katachi-cuda-rtx3080-bringup`
- commit: `205b69e58d3b4d99e07151ee76670b8b2ed496ed`
- original source path: `src/main.cpp` and `src/containment_kernel.ptx`
- current SHA-256: `FF72A8BFE9B9FA4B8E1973FE9EE8681BDC9628D13E823C5BA0E67ACCFD611D73`

The helper launches only this sibling filename. No HTTP request field can
select an executable path or command. The adapter additionally requires the
RTX 3080, float32, containment algorithm v1, `shadow: true`, and
`productionApplied: false` contracts before advertising the backend.

The worker adds a fixed `--worker-framed-json` mode with a 16-byte,
length-prefixed `KCF1` frame. The one-shot capabilities and JSON evaluation
modes remain available for review and diagnostics.
