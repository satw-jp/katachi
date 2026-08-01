# hikari — natural-light environments and receiver materials

Status: Tokyo open-air runtime active; room/window runtime pending
UpdatedAt: 2026-08-01

## Purpose

A transparent body is partly an image of its surroundings. The light source, visible environment, air, and receiving floor change its reflection, refraction, apparent color, shadow, and focused light. They belong inside hikari's transparent-material quality gate.

They also control whether the author's [light drawing](light-drawing.md) becomes a sharp line, a broad glow, or disappears into ambient light. That change must follow source size and direct/ambient balance rather than a separate blur effect.

hikari does not begin as a general lighting editor. Its main lighting study is natural light: move the same form between open air and a simple room, change the openings and its distance from them, then let a real place and time move the sun. Artificial light remains a Blender validation tool and a later extension, not the center of the Natural view.

The author's [first selected-image intake](reference-intake-2026-08-01.md) makes West window, real receiver surfaces, and furniture-scale placement primary reference conditions rather than optional styling. Long direct-light shadows and focused-light patches repeatedly extend beyond the transparent body.

## Current implementation truth

The current Natural view is primarily one procedural outdoor environment, now driven by a reproducible Tokyo civil date and time:

- Tokyo date/time resolves to a three-dimensional solar direction through a deterministic NOAA-style approximation;
- WebGL body/environment, CPU focused light, WebGPU focused light, and the saved optical scene share that direction;
- scrubbing the time recomputes direct light; below the horizon, direct sun and focused light stop while sky light remains;
- the earlier adjustable one-axis angle remains only as a labelled manual fallback;
- procedural sky, cloud, tree, and ground cues;
- environment rotation, contrast, and a haze-like visual effect;
- one hard-coded receiver plane whose brightness is scaled by `groundReflectance`;
- transparent shadow and focused-light textures composed separately.

For the controlled Blender comparison only, v0.29.2 adds one finite rectangular backlight emitter to BODY environment lookup. It reproduces the active `World + Emission plane` source in `study_01_light_size05.blend`; it is not a general artificial-light editor, does not enter receiver/shadow transport yet, and is not called a window. The physical reference remains west sun entering through a real window. That condition belongs to the explicit room/opening geometry below, where the solar direction and the vertical aperture remain separate quantities.

`daylightRoom.ts` now defines and validates a renderer-independent room, ceiling height, object point, and multiple rectangular windows on each of the four walls. It identifies sun-facing apertures and whether a direct ray reaches the object. This geometry is not rendered and does not clip the focused-light field yet. The view is therefore not yet room/window light, theatrical spotlight, participating fog volume, or a material-aware floor. Those names are used only after the relevant runtime model exists or are explicitly labelled as visual approximations.

## Scene boundary

The scene must let the author think about the transparent body and its environment together. Keep geographic time, room geometry, the body's pose, and the optical receiver explicit rather than compressing them into a lighting preset:

```ts
type DirectionalLight = {
  kind: "directional";
  direction: Vec3;
  color: Rgb;
  intensity: number;
  angularDiameterDeg: number;
};

type GeographicPlace = {
  id: "tokyo";
  latitudeDeg: number;
  longitudeDeg: number;
  timeZone: "Asia/Tokyo";
};

type StudyClock = {
  instantUtc: string;
  playbackMinutesPerSecond: number;
  paused: boolean;
};

type Opening = {
  id: string;
  face: "north" | "east" | "south" | "west" | "ceiling";
  kind: "open-face" | "window";
  widthMm: number;
  heightMm: number;
  sillHeightMm: number;
  horizontalOffsetMm: number;
};

type SpatialEnvelope =
  | { kind: "open-air" }
  | {
      kind: "simple-room";
      widthMm: number;
      depthMm: number;
      ceilingHeightMm: number;
      openings: Opening[];
    };

type NaturalLightStudy = {
  place: GeographicPlace;
  clock: StudyClock;
  atmosphere: "clear-approx";
  envelope: SpatialEnvelope;
  objectPose: RigidPose;
  receiver: Receiver;
  exposure: number;
  knownApproximations: string[];
};
```

`instantUtc` is the saved source of truth; the interface displays it in Tokyo time and never depends on the browser's time zone. A deterministic solar-position calculation produces the directional light. The first sky is a documented clear-sky approximation, not live weather.

Window count, proportion, size, position, and height are geometry. `openings` is an unrestricted array: one wall may contain no window, one window, or several independently positioned windows. `widthMm`, `heightMm`, `sillHeightMm`, and `horizontalOffsetMm` determine whether a ray can enter; they are not brightness sliders. Aspect ratio is derived from the recorded width and height, while spacing is derived from neighboring offsets. The nearest distance between the body and an opening is derived from `objectPose` and the opening plane, so it cannot disagree with the saved scene.

Friendly layout starters such as Single, Pair, Row, and Grid may create several `Opening` records, but they are never the saved source of truth. After creation, each window remains independently editable. A wall-wide opening uses `kind: "open-face"`; it is not represented as an arbitrarily bright window.

The rectangular area light in the [first Blender study](blender-study-01.md) remains useful for controlled validation of source size. It does not become a primary hikari environment. Stage, spot, point, and general artificial-light rigs are deferred.

## Initial natural-light studies

| Study | Variables | Question |
|---|---|---|
| Tokyo open air | date, time | How do the body, shadow, and focused light move through a day and season? |
| One-opening room | room width/depth/ceiling height; opening face, size, sill height, offset; body pose | How does a nearby transparent body receive and redirect direct daylight? |
| Multi-opening room | any combination of four wall faces; ceiling opening later | How does daylight change when one side, opposite sides, or all four sides are open? |
| Small unlit room | small explicit dimensions; no artificial source; body on/off | Can the body redistribute useful daylight into the room, and where is light lost or removed? |

The same simple room is both an environment around the transparent body and an object of study. The author may change the form to suit a room or change the room to reveal a form. hikari therefore saves the two together and does not treat architecture as a decorative backdrop.

The supplied Blender file stops at an area-light material study. It is not evidence that room daylight is complete; the selected physical photographs are the next visual references. Overcast sky, measured weather, glazing, furniture, and full room bounce are later studies.

## Daylighting-device comparison

The small unlit room is evaluated in paired states:

1. empty room, with the same openings, date, time, receiver, and exposure;
2. transparent body present at a recorded pose near an opening.

Compare the distribution of light on the floor, walls, and a small set of probe planes. Report concentrated regions, darker regions, chromatic shifts, and total received energy. The body may redirect and concentrate daylight locally; it must never be described as creating light or brightening the whole room without evidence. Early versions show direct sun, window clipping, transparent transport, and an approximate sky term. They explicitly do not claim reliable indoor illuminance until indirect room transport and calibrated units exist.

## Receiver choices

Follow the [abstract receiver surface](receiver-surface.md). Begin with readable families that only seed expanded parameters, not textured material authoring:

- **Pale surface:** baseline, with mortar/paper as a memory;
- **Dry surface:** neutral/warm and matte, with earth/stone as a memory;
- **Deep surface:** dark and matte, with wet earth or dark floor as a memory;
- **Living surface:** quiet green and coarse, with grassland as a memory but no grass texture;
- **Warm surface:** warm and directional, with flooring as a memory but no wood grain.

The first implementation changes abstract color, diffuse/specular return, roughness, and non-representational character. It does not invent a different optical path per family. Acrylic is a later thin-translucent receiver mode because it needs light continuation and an under-surface, not merely a preset.

## Natural-view controls

Keep the first invitation small, and reveal room geometry only when `Room` is selected:

```text
Place    [Open air] [Room]
Tokyo    [date] [time ─────────] [play / pause]

Room only
Openings [north] [east] [south] [west]
Room     [width] [depth] [ceiling height]
Windows  [single] [pair] [row] [grid] [+ add]
Selected [width] [height] [sill height] [horizontal position]
Body     [near window ↔ deep in room]

Surface  [Pale] [Dry] [Deep] [Living] [Warm]
```

The main view can offer small/medium/large room and near/middle/deep placement as quick starting points, but the saved values are always explicit millimetres. Before the transparent-material gate, near/deep only translates the body along the chosen opening's inward normal; its height and orientation stay fixed. General placement remains a later workflow. Opening direction is geographical even if the friendly label also says front/right/back/left. Date presets may include equinoxes and solstices; an exact date remains available. Time playback is slow enough to orbit, pause, and save an interesting state.

Technical solar angles, coordinates, units, and approximation notes remain in Analysis and the saved case. Switching environment or receiver never takes away camera, shape, material, compare, or save controls.

## Implementation order

1. Make `NaturalLightStudy`, `SpatialEnvelope`, openings, and `Receiver` explicit in `OpticalScene`; preserve existing manual light settings as a migrated compatibility mode.
2. Remove independent hard-coded receiver heights; CPU, view shader, and WebGPU use the same plane, light direction, source diameter, and light RGB.
3. Add a pure, tested Tokyo solar-position module and adapt its result to the shared directional light. Begin with fixed clear-sky behavior and no live-weather dependency.
4. Migrate the current outdoor view into Tokyo open air without changing its established appearance unexpectedly.
5. Add one simple room and one rectangular opening. Clip direct-sun and focused-light paths against real opening geometry.
6. Add explicit room width, depth, ceiling height, window width/height/sill/offset, and body pose; derive body-to-window distance.
7. Support multiple independently editable windows on one wall, including proportion and spacing changes, then extend the same array across all four wall faces.
8. Add time playback. Recompute the Natural view interactively and refine the receiver field after pause.
9. Add the opaque abstract receiver model and its starting families.
10. Add paired body/no-body daylight distribution and saved comparison probes for the small unlit room.
11. Validate finite source size with the Blender area-light study; defer artificial-light authoring, measured weather, glazing, and indirect room bounce.

## Quality gate

- The same Tokyo instant always restores the same solar direction, regardless of the computer time zone.
- Date and time move the body light, shadow, and focused-light field continuously; a sun below the horizon does not leave unexplained direct light.
- Openings admit direct light only when the sun path intersects their recorded size and position.
- One wall can contain multiple windows; changing count, aspect ratio, and spacing changes the admitted-light pattern without changing source intensity.
- Room width, depth, ceiling height, window geometry, and body-to-window relation are stored in physical units and survive save/reopen.
- One-, opposite-, and four-sided opening cases remain geometrically explainable.
- The body/no-body comparison uses the same exposure and reports redistribution, including losses and darker regions, rather than only attractive bright patches.
- The same authored surface trace sharpens under a small/direct source and softens under a broad source without changing geometry.
- Receiver changes alter how light is read without silently changing ray transport.
- A focused-light-disabled case retains its colored transparent shadow in open air and through a window.
- Orbiting never reveals a mismatch between the visible floor and the optical receiver plane.
- Saved cases restore location, UTC instant, playback state, envelope, openings, body pose, receiver, exposure, and approximation fields.
- Direct-only room results are labelled as such until indirect bounce is implemented and calibrated.
