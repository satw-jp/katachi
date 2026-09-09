# SKIN_R Astra Research Reader v0 Fix 3 evidence

- branch: `agent/skin-r-astra-reader-v0`
- Fix3 merge base: `95f110bd1a7b910e20f39c35a89cee349a54d5c5` (`origin/main`)
- merge commit before Fix3 changes: `d41e6a6d55c747e14ac3edd3e2abac896fcf7164`
- scope: Viewer continuity and bounded selection presentation only

## Implementation boundary

- Permanent display connectors are derived only from each member's recorded
  `connectedJunctions` identity. No nearest-neighbor member bridge is created.
- Connector geometry and the smaller junction markers are Viewer-only display
  geometry. Recorded points, radii, junction positions, authoring, generator,
  and production data are not changed.
- Junction display radius is bounded from the source member display radii so the
  marker reads at approximately branch scale.
- Selected member emphasis is reduced; selected, derived-adjacent, and
  recorded-parent overlays remain separate.

## Browser evidence

Browser: `http://127.0.0.1:5500/astra-reader.html`

1. Default `B_OPEN`, no selection: the Permanent network reads as a continuous
   structure through shared junction identities. The `INTERNAL JUNCTIONS /
   CANDIDATES` layer was then toggled off and the same branches remained
   visually continuous rather than appearing detached.
2. With `B_OPEN` selected member `E012`, the panel showed:
   - `CONNECTED JUNCTIONS`: `J024, J075` (`RECORDED`)
   - `DERIVED ADJACENCY`: `E124, E023, E088` (`DERIVED`)
   - `RECORDED PARENT`: `—` (`NOT RECORDED`)
3. With junctions and attachments restored, the selected branch remained clear
   while adjacent context and junction emphasis were subordinate. `Transparent`
   surface motifs made the underlying continuity legible.
4. `B_PARTICIPATING` with `CROSS-LINKS` enabled loaded the participating
   snapshot (`members 325`, `attachments 212`, `D1 353`, `removable 381`) and
   preserved the viewer-only, no-selection state.

## Verification

- focused snapshot test: pass
- partition typecheck: pass
- study tests: pass
- production build: pass
- `git diff --check`: pass

No actual radius editing, branch add/delete, junction movement, generator,
D0/D1/D2, or Production behavior was changed.
