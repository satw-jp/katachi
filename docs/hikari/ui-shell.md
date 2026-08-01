# Hikari application shell

Status: accepted direction, 2026-08-01

## Intent

Hikari is an observation application, not a long settings page. The viewport is the work. File operations belong in a stable bar at the top, while scene structure and the properties of the current subject belong in a dock on the right. The shell must keep the same shape as the project grows from one transparent body to rooms, windows, multiple bodies, inclusions, and living-shape studies.

## Stable regions

### Top application bar

The top bar contains only application-wide operations:

- application identity, version, and the KATACHI / HIKARI workspace switch
- open the current workspace file
- save the current workspace file
- export derived 3D data
- send a selected Hikari case to Blender
- enter the unobstructed observation view

Open and save are contextual. KATACHI opens/saves the replayable shape recipe. HIKARI opens/saves the complete observation case, including the shape recipe, optical settings, and camera. Derived outputs do not replace the editable source.

### Central viewport

The viewport always receives the remaining space. It never becomes a child of the scrolling inspector and never scrolls with controls.

### Right inspector

The inspector has two stable tabs.

`Layers` describes what exists in the scene and provides the future home for selection, visibility, and ordering. The initial Hikari hierarchy is Environment, Receiver, Transparent body, Inclusions, and Optical analysis. KATACHI exposes the shape field and selected construction element. A layer row must not imply a supported visibility switch until it actually controls the renderer.

`Properties` edits the current workspace or selection. Controls are grouped in short, collapsible sections. The most frequently used section stays open; advanced optical, diagnostic, export, and destructive controls start closed. Only the inspector body scrolls.

The distinction is deliberate: Layers answers “what am I working on?”, while Properties answers “how is it configured?”.

## Observation view

The Full screen action enters an unobstructed observation view:

- hide the inspector and ordinary top-bar controls
- preserve the exact camera, scene, and calculation state
- keep a small, discoverable exit control above the viewport
- use the browser Fullscreen API when available and fall back to the same distraction-free layout when it is not
- leave on Escape or the exit control without losing state

This is a viewing mode, not a second renderer or a separate saved case.

## Responsive behavior

At desktop width, the inspector is a fixed right dock. At narrow width, it becomes an overlay/drawer above the viewport so that the viewport never collapses to an unusable strip. The top bar may wrap or reduce labels, but open, save, and Full screen remain reachable. Touch targets remain at least 36 px high.

## Growth path

The shell anticipates, without fabricating controls for, the following hierarchy:

```text
Scene
├─ Environment
│  ├─ Tokyo sun / manual sun
│  ├─ Room
│  └─ Windows[]
├─ Receiver / floor
├─ Transparent bodies[]
│  ├─ Material and pigment field
│  └─ Inclusions[]
├─ Optical analysis
└─ Shape process / animation
```

Each future object receives a persistent ID. Blender sidecars use the same IDs and hierarchy, so the right inspector becomes the visible counterpart of the Hikari–Blender scene contract.

## Acceptance checks

- A first-time user can open, save, and export without scrolling the inspector.
- Switching KATACHI / HIKARI changes the meaning of Open and Save without changing their location.
- Layers and Properties are distinguishable and keyboard reachable.
- The viewport does not move when the inspector scrolls.
- Full screen can be entered and exited with real pointer interaction and retains state.
- At a narrow viewport, the central observation surface remains usable.
- Version and updated date remain visible in the ordinary application shell.

