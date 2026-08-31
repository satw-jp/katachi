# Windows local GeometryEngine — RTX 3080 shadow-only

This helper is a narrow loopback transport and reviewed executable adapter. It
binds only to `127.0.0.1:47658`, never scans ports or the LAN, and accepts only
the versioned `evaluateContainment` batch. The Web result remains authoritative;
the CUDA result is an observation and every completed response keeps
`shadow: true` and `productionApplied: false`.

The helper is isolated from `main.ts`, FKEI, production geometry, STL and 3MF.
Failure, timeout or comparison mismatch leaves the Web result unchanged.

## Reviewed executable

The fixed path is:

```text
tools/skin-local-engine/bin/katachi-containment-cuda.exe
```

It is the artifact from `satw-jp/katachi-cuda-rtx3080-bringup` commit
`205b69e58d3b4d99e07151ee76670b8b2ed496ed`, SHA-256
`0AE5FA195E6FE9FE5831603E3AC075FFBCF1B0F174E3768273EDD578BE516726`.
It uses `nvcuda.dll` Driver API and embedded PTX JIT; CUDA Toolkit and `nvcc`
are not required. Requests cannot choose a command or executable path.

Before advertising CUDA as available, the adapter requires:

- executable capability and result contract v1;
- `NVIDIA GeForce RTX 3080` and `float32`;
- algorithm `katachi.skin.evaluate-containment.metaball-radius.v1`;
- exact request, project, sample and edge identity;
- finite numeric results and timings;
- `shadow: true` and `productionApplied: false`.

## Loopback restrictions

- exact Host `127.0.0.1:47658`;
- mutation Origin limited to the Cloudflare production origin and fixed Vite
  development origins;
- mandatory `X-Katachi-Geometry-Prototype: shadow-only-v1` header;
- 8 MiB request limit;
- 250,000 containment sample limit.

The capabilities document also advertises the policy as `shadow-only`, Web
authoritative and `productionApplied: false`.

## Run and verify

Run the helper:

```text
node tools/skin-local-engine/server.mjs
```

Run the complete focused verification, including the frozen fixture through
the real helper and CUDA executable:

```text
npm run test:skin-local-engine
```

The end-to-end report includes Web/CUDA match status, maximum margin delta,
whole-path timing and CUDA kernel timing. Browser Local Network Access remains
a user-mediated permission; do not bypass it with unsafe browser settings.
