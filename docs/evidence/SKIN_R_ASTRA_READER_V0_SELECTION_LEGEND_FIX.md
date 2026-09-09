# SKIN_R Astra Research Reader v0 — selection hit area and color legend

- branch: `agent/skin-r-astra-reader-v0`
- starting HEAD: `cd9b155d4412e64a28313be4a90e9febb6809ba6`
- scope: Viewer hit-test proxy and persistent visualization legend only

## Bounded implementation

Member selection proxies now follow the same recorded member curve as the
displayed member using a transparent `TubeGeometry`. The proxy uses a small
bounded radius margin over the visible display radius, with `colorWrite: false`
and `depthWrite: false`, so it contributes only to raycast selection. Junction
proxies remain bounded spheres. Displayed member geometry, actual radii,
source records, and provenance are unchanged.

The Reader panel now keeps a persistent color legend for:

- OPEN CORE normal — `#52a7ff`
- SURFACE ATTACHMENT normal — `#58d68d`
- SURFACE MOTIF normal — `#e6d98a`
- SELECTED — `#ff4fa3`
- DERIVED ADJACENCY — `#55d9ff`
- RECORDED PARENT — `#ff63c7`
- JUNCTION — `#ffc857`
- TARGET MOTIFS / attachment correspondence — `#c17cff`

SELECTED is intentionally separated from the pale yellow normal motif color.

## Browser Gate

Browser: `http://127.0.0.1:5500/astra-reader.html`

Candidate: `B_OPEN`

The same visible long member was selected at four positions:

| Screen position | Result |
| --- | --- |
| `[100,550]` | `B_OPEN-G017` — endpoint-side area |
| `[130,590]` | `B_OPEN-G017` — curved section |
| `[165,640]` | `B_OPEN-G017` — long-branch middle |
| `[190,680]` | `B_OPEN-G017` — lower long-branch section |

The selected member rendered with the new magenta SELECTED overlay. The panel
continued to show its existing recorded parent/context rows and the permanent
legend remained available while the selection panel was scrolled.

The updated page had no browser console errors. Loaded B_OPEN counts remained
`members 262 · attachments 167 · D1 372 · removable 375`.

## Verification

- focused Astra snapshot test: pass
- partition typecheck: pass
- study tests: pass (`19 passed`; the local `os.userInfo` preload avoids the
  Drive-backed Node process's `uv_os_get_passwd` `ENOMEM`)
- production build: pass with `npm run build -- --emptyOutDir false`
- `git diff --check`: pass

Protected source geometry, actual radius semantics, snapshot source data,
provenance authority, generator, D0/D1/D2, Production, C/FKEI, and Authoring
remain outside the change.
