# SKIN_R Astra Research Reader v0 — attachment target correspondence

- branch: `agent/skin-r-astra-reader-v0`
- latest main fetched: `04cc8ccbb274437862b1813307e627683aec9d4f`
- merge policy: normal merge; worktree was already up to date with the fetched
  `origin/main` tip
- scope: Viewer-only attachment ↔ surface motif correspondence diagnostics

## Bounded implementation

The Reader now carries the source attachment correspondence as read-only
records. `branch_start_mm`, `branch_end_mm`, and `surface_component_id` remain
`RECORDED`. The surface-component table records its mapped motif IDs and its
attachment count. A component-to-motif mapping is shown only when the source
mapping contains it; otherwise the Reader reports `NOT RECORDED`.

When a `SURFACE ATTACHMENT` member is selected, the panel shows the normal
selection context plus the recorded branch endpoints, target component ID,
target motif IDs, and component-level attachment count. The endpoint and the
motif group are also marked in the viewer. The nearest distance from the
recorded branch end to target motif geometry is calculated by the Reader and
labelled `DERIVED`; no source geometry or attachment record is changed.

Component attachment count zero is diagnostic only. The Reader does not infer
an attachment reason and does not modify geometry. A motif without a direct
attachment is therefore interpreted at component level, not treated as a
failure.

## Browser Gate

Browser: `http://127.0.0.1:5500/astra-reader.html`

### B_OPEN selected attachment

Selected member: `B_OPEN-G000`

- recorded parent: `E085`
- recorded target surface component: `60`
- recorded branch start (mm):
  `[-1.8304506331376524, -3.216666328390576, 73.47606421261737]`
- recorded branch end (mm):
  `[5.696709392233095, 14.852312216083547, 68.073147564836]`
- target motif group: `M2, M55, M58, M86, M230, M270, M291, M308, M392,
  M410, M413, M414, M416`
- component attachment count: `1` (`RECORDED`)
- branch end → nearest target motif: `2.8008367317799063` (`DERIVED`)

The browser view showed the selected attachment as the normal highlighted
member, with the recorded start/end markers visible and the target component's
motif group highlighted. The panel kept `RECORDED PARENT` separate from
`DERIVED ADJACENCY`, and the provenance labels were visible for the new rows.

### Candidate switch

Switching to `B_PARTICIPATING` cleared the selection cleanly and retained the
Reader layers and motif mode. The loaded counts were:

`members 325 · attachments 212 · D1 353 · removable 381`

No correspondence panel error or geometry mutation appeared after the switch.

## Verification

- focused Astra snapshot test: pass
- study tests: pass (`19 passed`, with a local `os.userInfo` preload because
  the Drive-backed Node process otherwise returned `ENOMEM` from
  `uv_os_get_passwd`)
- partition typecheck: pass
- production build: pass with `npm run build -- --emptyOutDir false`; this
  Drive-safe variant avoids deleting the Drive-backed `dist/assets` directory
- `git diff --check`: pass

Protected source geometry, actual radius, snapshot source semantics, generator,
attachment generation, motif placement, provenance authority, D0/D1/D2,
Production, C/FKEI, branch/junction topology, and Authoring remain outside the
diff.
