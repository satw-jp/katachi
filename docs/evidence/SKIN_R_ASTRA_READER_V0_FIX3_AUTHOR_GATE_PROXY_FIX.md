# SKIN_R Astra Research Reader v0 Fix 3 Author Gate — picking proxy artifact

- branch: `agent/skin-r-astra-reader-v0`
- accepted Fix 3 checkpoint: `d5b8a98432d4c7151558ca7e380f56014394b37d`
- latest main fetched: `04cc8ccbb274437862b1813307e627683aec9d4f`
- merge commit before this fix: `67197bcdde5e33e96efd1d22444e4c7085df665f`
- scope: Viewer hit-test proxy material only

## Cause confirmation

Before the change, B_OPEN with no selection showed many large black circular
occluders over the Permanent network. Toggling `INTERNAL JUNCTIONS /
CANDIDATES` off left the black circles in place. This identified the artifact as
the invisible `addPick()` spheres rather than junction markers, connectors,
member geometry, or source data: the pick material used `opacity: 0` but kept
Three.js' default depth writing.

## Bounded fix

`addPick()` now keeps its proxy meshes in the raycast path while setting both
`colorWrite: false` and `depthWrite: false`. The proxy no longer contributes to
the framebuffer color or depth buffer; source points, actual radii, snapshot
records, provenance, true junction markers, and continuity connectors are
unchanged.

## Browser Gate

Browser: `http://127.0.0.1:5500/astra-reader.html`

- B_OPEN, no selection: black circular occluders disappeared and the branch
  network remained readable.
- B_OPEN with `INTERNAL JUNCTIONS` off: the same continuity remained and no
  black proxy circles appeared.
- B_OPEN with `INTERNAL JUNCTIONS` on: only the intended small orange junction
  markers returned; the large black artifact did not.
- With junctions off, a visible member click selected `B_OPEN-G032` and retained
  `RECORDED PARENT B_OPEN-G027`, confirming proxy raycast selection remains
  active.
- `Transparent` motifs remained available and made the blue internal structure
  readable.
- `B_PARTICIPATING` switched successfully, cleared selection, kept Transparent
  mode, and showed `members 325 · attachments 212 · D1 353 · removable 381`.
- `CROSS-LINKS` remained toggleable in B_PARTICIPATING.

The existing Fix 3 E012 browser evidence and snapshot provenance coverage remain
applicable because this change only modifies pick-proxy material flags.

## Verification

- focused Astra snapshot test: pass
- study tests: pass (`19 passed`)
- partition typecheck: pass
- production build: pass with `npm run build -- --emptyOutDir false`; the normal
  empty-output build also reached Vite but Google Drive-backed `dist/assets`
  deletion returned Windows `EPERM`
- `git diff --check`: pass

No branch/junction shape, actual radius, snapshot, provenance, authoring,
generator, D0/D1/D2, Production, C, or FKEI behavior was changed.
