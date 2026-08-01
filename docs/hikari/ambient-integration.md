# hikari × Ambient — environmental artwork contract

Status: design baseline; no cross-repository runtime dependency
UpdatedAt: 2026-08-01

## Intent

Ambient is not a soundtrack added after the hikari image is finished. Light, transparent matter, room, and sound are four partly independent layers of one environment. They share a small description of the current situation, but they are allowed to move at different speeds.

This protects the two qualities that matter:

- hikari remains a quiet instrument for orbiting, changing, and freezing an optical discovery;
- Ambient remains generative and spacious instead of narrating every visible event.

The first artwork question is therefore not “what sound corresponds to this color?” It is:

> What remains audible while the sun, windows, transparent body, and observer pass through different durations in the same room?

## Ownership boundary

The projects stay separate while their interfaces are unstable.

```text
hikari saved case
  place / solar time / apertures / optical reading / rare event
                         |
                         v
              HikariAmbientEnvelope v1
                         |
                         v
Ambient adapter
  smooth state changes / choose spatial layer / schedule rare response
                         |
                         v
Ambient sound engine
```

- hikari owns the visual scene, clock, window layout, optical classification, and author-triggered freeze/change events.
- Ambient owns voices, density, spectral balance, duration, silence, effects, and spatial sound behavior.
- The adapter owns interpretation and smoothing. Neither project imports the other's UI or source modules.
- A saved hikari case stores the emitted envelope and adapter version, not Ambient's entire internal state.

The existing Ambient project already accepts coarse environment changes through its WebSocket `world`, `env`, and `scene_state` messages and keeps sound synthesis in the browser. The first bridge should use that public boundary. It must not edit individual oscillators or trigger a sound on every rendered frame.

## Versioned envelope

```ts
type HikariAmbientEnvelopeV1 = {
  schema: "hikari-ambient/v1";
  caseId: string;
  sequence: number;
  capturedAt: string;
  time: {
    localDateTime: string;
    timeState: "morning" | "day" | "evening" | "night";
    solarAltitude01: number;
  };
  apertures: {
    family: "open-air" | "single" | "pair" | "row" | "field";
    openness01: number;
    orientationSpread01: number;
  };
  optics: {
    state: "direct" | "focused" | "scattered" | "absent";
    concentration01: number;
    transmitted01: number;
    chroma01: number;
  };
  room: {
    enclosure01: number;
    receiverDistance01: number;
  };
  event?: "form-frozen" | "form-released" | "room-changed" | "day-ended";
};
```

All `01` values are bounded descriptors, not physical measurements. In particular, `transmitted01` is not illuminance and must not be presented as energy performance before calibration.

## Mapping principles

The bridge produces tendencies, never notes or literal effects.

| hikari observation | Ambient tendency | Constraint |
|---|---|---|
| morning → day → evening → night | layer probability and long-term spectral centre | transition over tens of seconds or minutes |
| single/pair/row/field apertures | one, split, distributed, or diffuse spatial family | window count never equals note count |
| direct/focused/scattered/absent | dry proximity, sparse reflection, diffusion, or residual memory | brightness never maps directly to master volume |
| increasing enclosure | longer, darker room memory | room dimensions do not claim acoustic simulation |
| frozen form | one rare structural release | at most once for a new freeze sequence |
| day ended | allow sound to decay beyond the disappearance of daylight | do not replace the missing sun with spectacle |

The default adapter should cap continuous state updates at 1 Hz, ignore changes below a hysteresis threshold, and interpolate accepted changes over at least 20 seconds. Rare events are de-duplicated by `(caseId, sequence, event)`.

## Three presentation modes

### Studio study

One computer can run both projects, but the bridge remains optional. A Hikari case must still make sense in silence; Ambient must still run when hikari is disconnected. This is the fastest mode for authoring and recording a time work.

### Exhibition installation

Hikari runs the visual instrument or a deterministic saved sequence. Ambient runs as a separate sound endpoint so audio can recover independently. The bridge sends envelopes over a local network and keeps the last valid state through short disconnections. Manual mute, maximum level, restart, and a fully silent fallback are mandatory.

### Physical daylight room

The real room and transparent body become primary. Hikari supplies the score, comparison views, or scheduled cases rather than pretending to measure the room. Ambient receives the same intended time/opening state, while weather and actual daylight are documented as uncontrolled collaborators.

## Implementation stages

1. **Record only:** add an optional Ambient envelope to the saved Hikari case and show it in the case inspector. No audio connection.
2. **Adapter preview:** deterministically convert saved cases to an Ambient `world`/`scene_state` preview and display the outgoing values. No automatic transmission.
3. **Manual live bridge:** author explicitly enables a configurable WebSocket endpoint; accepted changes are smoothed and logged.
4. **Timed score:** replay a Tokyo day or selected cases using a separate timeline. Light and sound clocks may have different interpolation durations.
5. **Installation hardening:** heartbeat, reconnect, last-state hold, mute, level limit, startup ordering, offline sequence, and unattended recovery.
6. **Spatial version:** only after the optical and physical gates, map aperture families to tested multi-channel layouts rather than simulated room acoustics.

Do not begin Stage 2 until the optical scene can reliably classify direct, focused, scattered, and absent states. Do not begin the spatial version until a real room and speaker arrangement have been tested.

## Verification evidence

Every integration test should preserve:

- Hikari case ID and app version;
- envelope and adapter versions;
- emitted and accepted messages with timestamps;
- audio engine state before and after the change;
- a screen capture and a room/speaker diagram for exhibition tests;
- confirmation that silence, disconnect, duplicate event, and restart paths are safe;
- a note describing whether the relation felt causal, delayed, independent, or overly illustrative.

The success test is experiential: after ten minutes, the room should feel like one changing environment without making the sound appear to explain the image.
