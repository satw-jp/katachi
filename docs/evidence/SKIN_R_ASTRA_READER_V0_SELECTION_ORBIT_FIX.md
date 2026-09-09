# SKIN_R Astra Research Reader v0 — preserve selection during orbit

- branch: `agent/skin-r-astra-reader-v0`
- starting HEAD: `c8bda6c5c3cb17d9e5ab53b4991245c47e3551f3`
- scope: Viewer pointer gesture classification only

## Bounded implementation

Reader selection is now evaluated on `pointerup`, using the CSS-pixel distance
from the corresponding `pointerdown`. A movement below the 5px threshold is a
selection click; a movement at or above the threshold is an OrbitControls
gesture and does not change selection. `pointercancel` only clears the pending
gesture state. OrbitControls, camera behavior, geometry, pick proxies, source
snapshot data, and provenance are unchanged.

## Browser Gate

Browser: `http://127.0.0.1:5500/astra-reader.html`

Candidate: `B_OPEN`

1. Selected `B_OPEN-G017`; the selected highlight and member info panel were
   visible.
2. Dragged from empty background `[420,300]` to `[350,390]`; the camera orbit
   changed while the panel still showed `MEMBER B_OPEN-G017`.
3. Dragged from a selectable-object area `[25,620]` to `[90,540]`; the panel
   still showed `MEMBER B_OPEN-G017`, confirming object-starting orbit does not
   replace selection.
4. Single-clicked another selectable at `[20,450]`; selection changed to
   `B_OPEN-G124`.
5. Single-clicked empty background `[400,100]`; the panel returned to
   `選択なし。junctionまたはmemberをクリックしてください。`.

The browser console reported no errors after the gate.

## Verification

- focused Astra snapshot test: pass
- partition typecheck: pass
- study tests: pass (`19 passed`; local `os.userInfo` preload avoids the
  Drive-backed Node process's `uv_os_get_passwd` `ENOMEM`)
- production build: pass with `npm run build -- --emptyOutDir false`
- `git diff --check`: pass

Protected geometry, pick proxy semantics, snapshot/provenance, generator,
D0/D1/D2, Production, and Authoring remain outside the change.
