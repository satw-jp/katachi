# SKIN REBUILD Windows local GeometryEngine transport — 2026-08-30

Status: design only. This document does not implement a local service, CUDA,
change production runtime code, change FKEI, or change geometry output. The
first-print baseline and current Web implementation remain authoritative until
the physical print result is recorded.

## 1. Decision

Use a **Windows native helper bound only to a fixed loopback address, with a
job-oriented HTTP API used through browser `fetch()`**.

- control and small portable values: versioned JSON over HTTP;
- large inputs/results: content-addressed binary artifacts over HTTP;
- progress: a `fetch()` response stream carrying sequenced NDJSON events;
- cancel: an idempotent `DELETE` on the job;
- browser default: `Compute: Web`;
- optional Windows choice after an explicit detect/connect action:
  `Compute: Windows RTX 3080` or `Compute: Windows CPU`;
- any detection, permission, version, service or CUDA failure leaves the
  project intact and returns to the Web engine.

The helper is the native/CUDA process boundary; localhost HTTP is its first
transport. Electron or Tauri is not required and the Cloudflare UI remains the
canonical UI.

```text
Cloudflare or local SKIN Web UI
        |
        | GeometryEngineClient (portable jobs)
        |
        +-----------------------+
        |                       |
        v                       v
WebGeometryEngine       WindowsLocalGeometryEngine
current Workers/CPU     fetch http://127.0.0.1:<fixed-port>/v1
                                |
                                v
                     native helper: CPU reference / CUDA
```

The fixed port is part of the installed helper contract, but its number is not
chosen in this design. Installation must reserve and document one port before
runtime implementation. The client must not scan a range of localhost ports.

## 2. Current constraints and evidence

The current deployment is `https://katachi.a-8c3.workers.dev` and
`wrangler.jsonc` serves only static assets from `./dist`. No `_headers` file,
Content-Security-Policy or `connect-src` is currently present in the repository.
If CSP is introduced later, it must explicitly allow only the selected loopback
origin in addition to `'self'`; this document does not loosen headers now.

The browser boundary has three independent gates:

1. **Local Network Access (LNA).** The current WICG proposal requires a secure
   initiating context and user permission for a public page to access a local
   or loopback endpoint. Chromium currently applies the restriction to public
   to local/loopback requests. Permission denial is a normal capability result,
   not an application error. The same proposal applies the check to Fetch,
   WebSocket and WebTransport. See the
   [Local Network Access specification](https://wicg.github.io/local-network-access/).
2. **Mixed content / secure context.** The LNA design notes that loopback is
   already potentially trustworthy, so `http://127.0.0.1` does not need the
   special local-address mixed-content hint. Plain LAN IPs are deliberately not
   used. Browser behavior is still capability-tested rather than assumed.
3. **CORS and service authorization.** LNA permission is not authorization for
   the helper. Cross-origin Fetch still requires CORS, while the helper itself
   must defend against CSRF and hostile public pages. The
   [Fetch CORS protocol](https://fetch.spec.whatwg.org/#http-cors-protocol)
   requires the response to opt into the requesting origin.

These APIs and rollout state are evolving. The client therefore treats native
compute as an optional capability and never makes basic editing, FKEI Open/Save
or Web compute depend on it.

## 3. Transport comparison

| option | same Cloudflare UI | progress/cancel/binary | public HTTPS to localhost | operational cost | decision |
| --- | --- | --- | --- | --- | --- |
| Localhost HTTP + Fetch | Yes | Response streams, `AbortSignal`, job `DELETE`, binary bodies | LNA permission and CORS apply; loopback is the narrow target | Lowest; ordinary native HTTP server and browser API | **Adopt for prototype and v1** |
| WebSocket | Yes | Good bidirectional progress; binary frames; custom cancel protocol | LNA also applies. `ws://` has no Fetch `RequestInit`-style target-address hint; server must validate `Origin` and design its own flow control/replay | More connection state and framing than this one-request/many-progress job model needs | Do not adopt initially |
| WebTransport | Yes in supporting browsers | Excellent multiplexed streams, cancellation and binary transfer | LNA applies; TLS is mandatory in practice and certificate failure is fatal | HTTP/2 or HTTP/3/QUIC server, certificate bootstrap and less mature interoperability | Defer; reconsider only if profiling proves HTTP transfer/parallelism inadequate |
| Native helper + localhost | Yes | Depends on the selected localhost protocol | Same browser gates as its protocol | Installer, signing, updates, crash handling required regardless | **Adopt as deployment architecture, using HTTP** |
| Electron/Tauri full migration | Not automatically; creates another application shell | Native IPC is capable | Avoids public-page localhost constraints inside its shell | Duplicated distribution, update, security and UI-parity work; iPad/Mac Web path remains separate | Reject as the default architecture |

WebSocket is a valid later optimization for unusually interactive native jobs,
but its bidirectional session does not help the first coarse job contract. The
[WebSockets standard](https://websockets.spec.whatwg.org/) integrates opening
handshakes with Fetch, and the LNA proposal explicitly notes the absence of a
`RequestInit` equivalent for `ws://`.

WebTransport supports multiple streams and datagrams, but the current
[WebTransport specification](https://w3c.github.io/webtransport/) still calls
the protocol/API work in progress. It requires TLS-equivalent authentication,
certificate errors are fatal, and local custom certificates require a separate
certificate-hash bootstrap. That complexity is not justified by the first
bounded geometry job.

## 4. Detection and user experience

The UI starts without network probes:

```text
Compute: Web
Windows engine: Detect...
```

Detection is behind an explicit user action so an LNA permission prompt has
clear context. The client performs one side-effect-free request with a short
timeout:

```text
GET http://127.0.0.1:<fixed-port>/v1/capabilities
```

It never scans the LAN or multiple ports. Outcomes are distinct:

- no listener/timeout: `Windows engine not running`, remain on Web;
- browser/LNA denied: explain that local access permission is required, remain
  on Web;
- CORS/origin/pairing rejected: show a local-engine authorization failure;
- incompatible protocol major: show versions and remain on Web;
- compatible CPU only: offer `Compute: Windows CPU`;
- compatible CUDA device: offer the advertised device, for example
  `Compute: Windows RTX 3080`;
- helper disappears after selection: fail the active job, discard its partial
  candidate result, and offer retry or Web fallback.

Mac, iPad and another PC normally find no local Windows helper and continue
with Web. The design does not route jobs over the home LAN: a helper on the
Windows machine is available only to a browser running on that same machine.
Remote native compute would be a separate authenticated service design.

Automatic reconnect may be offered after the user has explicitly paired once,
but it still uses the single known endpoint, a short timeout and no permission
workarounds. The app must not repeatedly trigger permission prompts.

## 5. Minimal GeometryEngine job contract

The API is coarse grained. It never exposes per-point SDF calls across HTTP.
Six operation names are sufficient for the planned boundary:

- `buildMesh` — realize a complete requested geometry snapshot and return mesh
  plus diagnostics;
- `analyzeSurface` — batch surface, topology, overhang or nearest-surface
  analysis;
- `evaluateContainment` — batch signed-distance/inside and radius-clearance
  queries;
- `importMeshBase` — validate and normalize a portable mesh Base into declared
  BaseGeometry capabilities;
- `realizeNetwork` — realize portable Node/Edge topology and edge recipes;
- `realizeJunction` — realize portable Motif-to-Network junction intent.

They share one envelope rather than proliferating endpoint-specific protocols:

```ts
type GeometryJobRequest = {
  protocol: { major: 1; minor: number };
  clientRequestId: string;
  operation:
    | "buildMesh"
    | "analyzeSurface"
    | "evaluateContainment"
    | "importMeshBase"
    | "realizeNetwork"
    | "realizeJunction";
  algorithmContract: string;
  projectFingerprint: string;
  coordinateContract: {
    frame: "object" | "millimeter";
    unitsPerMillimeter: number;
    handedness: "right";
    buildAxis: "+z";
  };
  quality: Record<string, number | string | boolean>;
  input: Record<string, unknown>;
  artifacts: Array<{
    role: string;
    sha256: string;
    mediaType: string;
    byteLength: number;
  }>;
};
```

Conceptual HTTP surface:

| method/path | role |
| --- | --- |
| `GET /v1/capabilities` | protocol, engine/backend versions, CPU/CUDA devices, supported operations/contracts, limits and numeric precision |
| `PUT /v1/artifacts/{sha256}` | bounded content-addressed binary upload; verifies length and hash |
| `POST /v1/jobs` | validate immutable envelope and return `202` plus job ID |
| `GET /v1/jobs/{id}` | durable status, result manifest, warnings and error code |
| `GET /v1/jobs/{id}/events?after={sequence}` | streamed NDJSON progress with monotonic sequence numbers |
| `DELETE /v1/jobs/{id}` | idempotent cancel request |
| `GET /v1/artifacts/{sha256}` | binary result download with length and hash |

`POST /jobs` accepts neither an arbitrary filesystem path nor a command. STL,
mesh, volume and generated triangle data cross as bounded binary artifacts, not
JSON number arrays. Small graph/intent/project subsets remain canonical JSON.
Artifacts are reusable by hash within a short local cache, preventing repeated
large uploads when only parameters change.

### Result contract

Every completed job returns:

- job/request ID and the exact input `projectFingerprint`;
- operation and algorithm-contract versions;
- result artifact hashes and portable scalar/graph facts;
- backend ID, engine version, CPU/CUDA device and precision mode as provenance;
- structured warnings and a terminal status;
- for mesh jobs, the TASK 12 `GeometryResultContract` fields so
  `compareGeometryResult(reference, candidate, tolerances)` can compare Web and
  native results without backend-specific test code.

The browser applies a result only if the active project fingerprint still
matches. Partial, canceled, crashed or stale results never update authored
state.

## 6. Progress, cancel, streaming and crash recovery

The progress stream uses `fetch()` rather than the `EventSource` constructor so
the client can use the same authorization header, CORS behavior and
`AbortSignal` as other calls. Each NDJSON record has:

```ts
type GeometryProgress = {
  sequence: number;
  phase: string;
  completed: number;
  total: number;
  message?: string;
  warning?: { code: string; detail: string };
};
```

The browser may reconnect with `?after=<lastSequence>` and then reconcile with
`GET /jobs/{id}`. This mirrors the replay property provided by the
[HTML server-sent event model](https://html.spec.whatwg.org/multipage/server-sent-events.html)
without depending on an EventSource connection that cannot attach the pairing
header. Fetch responses expose `ReadableStream`; `AbortSignal` stops the client
request, while `DELETE` requests semantic compute cancellation. Closing the
stream alone must not be assumed to stop CUDA work.

The helper persists only bounded job metadata and temporary artifacts. After a
process restart, an unfinished job becomes `failed: engine_restarted`; it is not
silently resumed with unknown GPU state. Completed artifacts may remain by hash
until an explicit size/time cache policy removes them. UI retry creates a new
job with the same project fingerprint and can reuse verified input artifacts.

## 7. Security contract

Loopback is not a security boundary by itself. The helper must implement all of
the following before it may run shape-affecting jobs:

- bind only to `127.0.0.1` (and separately `[::1]` only if explicitly tested),
  never `0.0.0.0` or a LAN interface;
- use one fixed endpoint; reject unexpected `Host` and `Origin` values;
- allow only an explicit origin list, initially
  `https://katachi.a-8c3.workers.dev` and deliberately configured local dev
  origins; reflect no arbitrary origin and send `Vary: Origin`;
- implement exact CORS methods/headers and `OPTIONS`; never use `*` with an
  authenticated request;
- require an explicit helper-side pairing approval and a short-lived bearer
  token for jobs/artifacts; keep the token only in browser memory and never put
  it in a URL, FKEI or Cloudflare storage;
- keep `GET /capabilities` non-sensitive and side-effect free, but return no
  machine identifiers beyond coarse advertised backend capability until paired;
- reject simple-form mutation requests, require a non-safelisted custom header,
  verify the exact origin again, and rate-limit failures to reduce CSRF risk;
- accept only bounded schemas/media types/byte lengths, verify SHA-256, cap
  decompression and allocation, and reject NaN/non-finite geometry values;
- expose no arbitrary file read/write, shell, plugin loading, Cloudflare token,
  browser storage or native pointer through the API;
- sign the Windows helper and update channel; show engine/version/device and the
  requesting site in the pairing UI;
- log job IDs, origin, versions, sizes and status, but not full project bodies or
  bearer tokens.

LNA user permission supplements these controls; it does not replace them. The
LNA specification explicitly states local services must still defend against
CSRF and should not rely on the browser permission alone.

If the public site later sends a Content-Security-Policy, use an exact directive
such as `connect-src 'self' http://127.0.0.1:<fixed-port>` after real browser QA.
Do not add a wildcard or private-LAN range. A locally trusted HTTPS endpoint can
be reconsidered for defense in depth, but installing/rotating a local CA and
certificate is outside the first prototype.

## 8. Version negotiation and fallback

`/capabilities` advertises protocol major/minor, engine version, operation
versions, numeric modes and limits.

- major mismatch: no native jobs; Web fallback;
- compatible major, older minor: use only the intersection of advertised
  fields/operations;
- unsupported algorithm contract or precision: do not substitute silently;
- CUDA unavailable/out of memory: the local helper may use its advertised CPU
  implementation only after returning provenance that says so; otherwise the
  browser offers Web fallback;
- network/service crash: no automatic application of partial work; reconcile
  job status, then retry or Web fallback;
- result comparison failure: retain the Web reference and surface the candidate
  diagnostics; never widen TASK 12 tolerance automatically.

The selected backend is execution preference, not project identity. The UI can
remember it locally, but opening the same FKEI on Mac/iPad/another PC must work
without the helper.

## 9. FKEI remains backend independent

FKEI stores portable authored intent and portable derived evidence only:

- Base/Motif definitions, graph topology, cleanup/simplification intent and
  Junction intent remain shared project data;
- backend URL, port, pairing token, Windows path, CUDA pointer/buffer, local job
  ID and cache key are never required FKEI fields;
- optional provenance may say which compatible implementation produced a
  recomputable artifact, but it cannot make that implementation mandatory;
- CPU, CUDA and Web all consume the same coordinate and algorithm contracts;
- Save/Restore, selection, Phase Navigator and Graph editing never call native
  compute merely to read the project.

This preserves the TASK 9–11 boundary and supports STL Base Import, Custom
Curve Motif, Base Surface Graph, Graph Cleanup, Curved Network Edge and
Calyx-like Junction without transport-specific project branches.

## 10. First CUDA prototype

Prototype the **radius-aware Spider containment batch** behind
`evaluateContainment`, in shadow mode only.

Implementation unit:

1. build the signed Windows helper with `/capabilities`, pairing, artifact and
   job lifecycle, initially with a native CPU reference implementation;
2. send the current Base field parameters plus a batch of existing Spider edge
   samples/radii under the frozen coordinate and algorithm contracts;
3. add one CUDA kernel that evaluates Base SDF/clearance for the batch on the
   RTX 3080 and returns signed margins and pass/fail facts;
4. compare CPU/Web and CUDA facts, classifications and bounded numeric margins
   in tests; record provenance and timing;
5. keep the result observational: do not accept/reject, reroute or regenerate
   the production lattice from CUDA at this stage;
6. verify cancel, helper crash, CUDA unavailable and forced Web fallback before
   any shape-affecting opt-in experiment.

This unit is massively parallel, has compact inputs/results, exercises binary
transport and cancellation, and cannot change current output while in shadow
mode. It is safer than making `buildMesh` the first CUDA operation. After
conformance is proven, SDF-grid sampling/mesh generation can reuse the same job
and artifact transport and the TASK 12 mesh comparison contract.

## 11. Implementation sequence after the physical-print gate

1. Freeze this HTTP contract in shared TypeScript/schema fixtures; implement a
   mock loopback server and browser adapter without CUDA.
2. Browser-test Cloudflare HTTPS -> `127.0.0.1` on supported Windows Chrome and
   Edge, including grant/deny/reset, CORS, CSP, service absent and Web fallback.
   Also confirm Mac/iPad/Firefox/Safari fail gracefully; do not claim universal
   LNA interoperability from one browser.
3. Implement pairing, limits, signed installer/update and native CPU shadow
   containment. Security review precedes CUDA.
4. Add the CUDA shadow kernel and compare it to current Web/CPU fixtures.
5. Profile artifact transfer versus computation. Consider WebSocket or
   WebTransport only if measured HTTP streaming is the bottleneck.
6. Permit an explicit developer opt-in to use a conforming native result. Keep
   Web fallback and migration harness permanently available.

Acceptance requires no change to the frozen baseline FKEI SHA, a clean Web-only
path with the helper absent, exact discrete project/graph invariants, reviewed
numeric tolerances, cancel/crash recovery, origin/pairing tests, and the same
FKEI on Windows and non-Windows clients.

## 12. Primary references

- [WICG Local Network Access](https://wicg.github.io/local-network-access/)
- [WHATWG Fetch: CORS protocol](https://fetch.spec.whatwg.org/#http-cors-protocol)
- [WHATWG WebSockets](https://websockets.spec.whatwg.org/)
- [W3C WebTransport](https://w3c.github.io/webtransport/)
- [WHATWG HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [WHATWG Streams](https://streams.spec.whatwg.org/)
