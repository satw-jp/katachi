# Hikari × Ambient — five-voice mix

Status: design direction, 2026-08-01

## Intent

Ambient's five simultaneous sounds can become five simultaneous transparent bodies. Each body is a visual voice: it has its own shape, material, position, phase, and slow automatic rotation. The bodies should not twitch like an equalizer. Sound and image are two appearances of the same evolving environment.

The first implementation belongs inside Hikari as `Mix` beside the existing single-body `Study`. A separate application would duplicate Hikari's cases, material controls, camera, natural light, export, and Blender bridge before the relationship has been learned.

## Experience

`Study` remains the accurate place for one transparent body, one inclusion study, and Blender comparison.

`Mix` opens a five-voice view:

```text
Ambient mix
├─ Voice 1 — case / sound binding / response
├─ Voice 2 — case / sound binding / response
├─ Voice 3 — case / sound binding / response
├─ Voice 4 — case / sound binding / response
├─ Voice 5 — case / sound binding / response
└─ Shared environment — sun / room / floor / camera / master response
```

The initial composition is five parallel lanes. Each voice appears to rotate through an independent deterministic camera orbit driven by monotonic Hikari time. The physical body and receiver do not rotate, so the established one-body optical result remains valid. Stopping Ambient does not reset the composition; it eases the response toward stillness. A `Freeze` action stops the chosen visual moment without changing the audio engine.

The right Layers panel lists the shared environment and five voices. Selecting a voice shows its Hikari case, sound binding, base pose, automatic motion, and response mapping in Properties. The top bar keeps Open, Save, Export, Blender, and Full screen in the same positions as Study.

## Do not infer five channels from today's code

The current Ambient repository is not a fixed five-track data model. It contains eight React sound layers, six prominently displayed desktop layers, eight continuous generator groups, and additional scheduled/event voices. The five voices therefore need an explicit, user-editable binding contract instead of deriving their identity from array order.

A possible first preset is illustrative, not canonical:

| Visual voice | Ambient sources | Shared state |
|---|---|---|
| Water | water | flow, wave, ocean |
| Air | wind | vortex, wind |
| Rain | rain | density, weather |
| Life | bird + insects | birds, plants |
| Resonance | bell + drone | space, memory |

The author can replace these bindings with the five actual mix voices without changing Hikari's renderer or file format.

## Two kinds of input

Hikari must keep slow environmental state separate from fast audio response.

### World state

Ambient `WorldState` controls the shared place: time, weather, season, wind, ocean, birds, plants, light, space, memory, stillness, and breath. These values drive the whole environment: Tokyo time or light warmth, mist, room character, floor response, camera breathing, and persistence.

### Audio analysis

Per-voice audio analysis controls small responses around a designed base state. Ambient already broadcasts normalized master spectrum and named source waveforms/levels every 80 ms. Hikari interpolates these frames at render rate and applies separate attack/release smoothing. Network arrival time must never be integrated directly into rotation or shape state.

Suggested restrained mappings:

| Signal | First visual response | Later visual response |
|---|---|---|
| channel enabled / mix amount | presence and base scale | body spacing |
| smoothed RMS envelope | 1–4% breathing | slow local inflation |
| low band | vertical weight and swelling | viscous sag amount |
| mid band | rotation speed and axis lean | bending field |
| high band | highlight/caustic activity | fine surface response |
| transient | short light pulse | bounded pinch or ripple |
| pan / spatial position | lane offset and lean | position in shared room |
| reverb / memory | global mist and persistence | motion afterimage |

Physically named Study parameters must not be silently repurposed. Audio-driven color, IOR exaggeration, or light pulses belong under an explicit `Performance response` section and are stored as artistic mappings.

## Data contracts

### Live frame

```ts
interface AmbientVisualFrameV1 {
  version: 1;
  sequence: number;
  engineAudioTime?: number;
  sentAtMs?: number;
  world: AmbientWorldSnapshot;
  master: AnalysisFrame;
  channels: [VisualChannelFrame, VisualChannelFrame, VisualChannelFrame, VisualChannelFrame, VisualChannelFrame];
}

interface AnalysisFrame {
  level: number;
  low: number;
  mid: number;
  high: number;
  onset: number;
}
```

V1 can adapt today's `spectral` and `waveform` messages without changing the audio engine. Sequence and audio time are optional during the first responsive prototype, then become required for repeatable recording.

### Saved mix

`*.hikari-mix.json` stores:

- version and provenance
- exactly five visual slots with stable IDs
- embedded or hash-addressed Hikari cases
- Ambient source bindings
- layout and view-orbit axes/speeds/phases
- response curves, smoothing, and clamps
- shared environment, camera, and optical quality policy
- optional recorded visual-frame timeline

Hikari must not depend on Ambient's current browser-only A–D scene slots. A saved work needs to reopen even when the Ambient UI local storage is absent.

## Live connection

The cheapest first bridge is read-only WebSocket telemetry. Hikari registers as an Ambient controller and consumes existing `spectral`, `waveform`, `env`, and `scene_state` messages. Hikari does not change the mix in the first live version.

The public Hikari site uses HTTPS and cannot safely connect directly to Ambient's LAN `ws://...:8080`; browsers block that as mixed content. The efficient live setup is therefore:

```text
Ambient Python server (LAN, HTTP :8080)
├─ /engine   — audio engine
├─ /ui       — Ambient controller
├─ /hikari   — Hikari live build
└─ WebSocket — state + analysis
```

The public Cloudflare Hikari remains standalone and can play recorded `hikari-mix` timelines as demos. A public WSS relay is a later deployment decision, not a prerequisite for learning the audiovisual relationship.

## Rendering strategy

Five parallel voices and five bodies in one shared optical room are different technical stages.

The first Mix view uses one WebGL context and five scissored render passes. Each lane is an independent observation of one Hikari case; it does not cast light through another lane. Camera orbit provides the initial apparent rotation. The UI must label this honestly as `5 views / mutual optics off`. The selected voice receives the full Hikari optical calculation; unselected voices reuse cached caustic fields or bounded preview quality. Five canvases, five WebGL contexts, and five WebGPU engines are explicitly avoided.

A later shared-space view places all five bodies in one room. It requires multi-body medium ordering, shared transparent shadows, cross-body caustics, spatial acceleration, and a larger optical budget. It must not be approximated by overlapping five single-body results and presented as physically correct.

## Implementation order

### 0. Optical calibration gate — current priority

Match the same-resin, lower-absorption inclusion against the Ref Blender study and keep it separate from different-IOR inclusions. Mix work must not hide an unresolved transparent-material mismatch.

### 1. Five-voice motion study — Hikari only

- Add Study / Mix switching.
- Display five clones of one proven Hikari case in parallel lanes.
- Give each view a deterministic slow camera-orbit axis, speed, phase, pause, and Freeze.
- Add five Layers rows and selection-dependent Properties.
- No audio, network, or shape deformation.

Gate: stable 60 fps target on the primary Mac at bounded preview quality; no change to the single-body Study output.

### 2. Recorded/synthetic response

- Define `AmbientVisualFrameV1` and `hikari-mix.json`.
- Drive the five views with deterministic test envelopes and a recorded frame file.
- Implement smoothing, clamping, inactivity fade, and replay.
- Begin with camera orbit, presentation-scale breathing, and exposure trim only; do not alter physical optics.

Gate: the same file replays the same motion and can be paused on the same frame.

### 3. Ambient adapter

- Bind the five semantic slots to current source names and WorldState keys.
- Convert existing 80 ms `spectral` and `waveform` messages into visual frames.
- Keep the adapter configurable; do not change the Ambient engine's source architecture yet.

Gate: missing or extra Ambient sources degrade to silence without reordering visual voices.

### 4. LAN live mode

- Serve Hikari under Ambient `/hikari`.
- Connect read-only to the same-origin WebSocket.
- Show connected, replay, and no-signal states.
- Compare live input with the same recorded input.

Gate: an Ambient restart or disconnect does not reset cases, camera, or voice placement.

### 5. Save, capture, and Blender handoff

- Save all five cases and bindings in one mix file.
- Record smoothed frames with sequence and audio time.
- Export five named Blender objects, deterministic rotations, shared camera/light, and an animation timeline.
- Keep final Cycles rendering and artistic camera decisions in Blender.

Gate: reopening or importing the capture preserves voice identity and timing.

### 6. Slow shape response

- Add bounded SDF inflation, bend, and pinch fields.
- Let the author choose which channel affects which operation.
- Separate temporary performance motion from edits committed to a Hikari case.

Gate: transparent-material comparison still passes at the deformation extremes.

### 7. Living-shape response

- Connect slime, cloud, growth, fermentation, and MPM processes.
- Audio/WorldState changes forces and boundary conditions, not raw vertices.
- Freeze a beautiful moment into a new reproducible case.

Gate: simulation is deterministic from seed + recorded input, or is explicitly marked non-repeatable.

### 8. Shared optical space and installation output

- Place five bodies together in one room.
- Replace view orbit with explicit physical body poses only in this shared-stage mode.
- Compute shared shadows and cross-body light relationships.
- Add multi-channel spatial audio positioning only after the visual composition is understood.
- Combine captured Hikari motion and Ambient audio for exhibition, film, and competition outputs.

## Decision

Begin as a Hikari Mix mode, not a separate application. Use one cloned, optically validated shape for the first five-voice motion study. Prove composition and performance with recorded envelopes before touching the live Ambient engine. Then add the existing read-only telemetry bridge. Shape deformation, MPM, shared caustics, and bidirectional control follow only after replay and identity are stable.
