# hikari — overnight implementation plan, 2026-08-01

Status: authorized implementation session
UpdatedAt: 2026-08-01

## Author priorities received tonight

1. The current largest visual concern is the shadow/light pattern that runs across the receiver like a scribble.
2. The optical scene must be able to grow from one inclusion to several. Multiple inclusions are important because the author is fabricating a related physical work now.
3. A dark outer body containing light expresses comfort in darkness. Brightness is not the absolute measure of comfort, and the renderer must not automatically lift or erase the dark host merely to expose its interior.

## Work order

### 1. Freeze the current baseline

- Record the current build and Hikari contract-test result before optical changes.
- Do not reset or rewrite the existing uncommitted work.
- Keep the source photographs and videos in the external `hikari/Ref` folder read-only.

### 2. Establish the light-drawing reference path

- Make CPU receiver sampling use the requested optical sample count rather than only the visible-ray count.
- Keep the visible diagnostic rays limited independently from receiver-field samples.
- Accumulate receiver hits in a fixed, world-space domain at 256 × 256.
- Remove adaptive percentile framing and per-frame maximum normalization from the reference field.
- Use deterministic sampling and a fixed exposure relation so a still case converges instead of changing layout.
- Preserve transparent shadow and focused light as separate outputs.

### 3. Verify inclusion extensibility

- Keep `OpticalScene.inclusions` as an ordered array with unique medium IDs.
- Add a contract case containing at least two inclusions and verify JSON round-trip.
- Do not add a single-inclusion-only field to the case format or renderer boundary.
- Defer full multi-boundary transport and author-facing inclusion UI until ordered medium traversal is implemented and invalid containment can fail honestly.

### 4. Preserve darkness as authored information

- Do not introduce automatic exposure normalization that makes every dark host equally bright.
- Treat a dark host with a clear or luminous-looking inclusion as a primary visual acceptance case.
- Record that black silhouette, disappearance, and delayed interior visibility can be intended observations, not rendering failures.

### 5. Verify and record

- Run Hikari contracts and the production build.
- Open the local Hikari view, check real pointer interaction, and capture the Natural view.
- Compare at least one fixed-shape case before/after the receiver-field change.
- Write observation, interpretation, and remaining limits separately.

## Acceptance for tonight

- The build remains green without discarding unrelated working-tree changes.
- A CPU fallback uses more samples for the receiver field than it draws as visible rays.
- Receiver-field framing no longer follows hit percentiles from frame to frame.
- Receiver brightness no longer depends on the brightest texel of the current frame.
- Two inclusion records validate and survive a Hikari case round-trip.
- The documentation explicitly preserves darkness as part of comfort and not as a defect to auto-correct.

## Not claimed tonight

- physically complete caustics;
- several real nested boundaries in the live WebGL/WebGPU renderer;
- final artistic approval of the light drawing;
- equality with the selected physical photographs or Blender;
- calibrated exposure, resin absorption, or source radiance.

## Continuation result — LD1 prototype

- Replaced shader-only `surfaceVariation` with a saved curved-ribbon boundary displacement shared by CPU, WebGL, and WebGPU.
- Renamed the UI control to `表面の手跡`; default 0.14, bounded author range 0–0.25.
- Added an LD1 test proving local boundary/normal change and real refracted receiver-hit movement for identical incoming rays.
- Generated a fixed 16,384-ray OFF/ON/difference image at IOR 1.5 and light angle 60°.
- Lowered the fixed receiver exposure to 0.22 after the previous 0.7 saturated the focus and hid the oblique trace; `光溜まり` remains the deliberate author-facing display control.
- Increased the single reconstruction pass from one to two texels, matching the approximate 128×128 source lattice to the 256×256 receiver without restoring adaptive blur.

The image demonstrates a diagonal light stroke caused by geometry, but peripheral sampling is still dotted and the trace is an analytic proxy. Browser-level WebGL/WebGPU screenshot verification remains unavailable in the current verification environment; the recorded image is the CPU reference output.
