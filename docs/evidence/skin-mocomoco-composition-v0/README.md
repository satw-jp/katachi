# Issue #27 — SKIN Composition Flow v0

Isolated Composition mode completed the locked MOCOMOCO → D BACKARC flowers → shared branches → `.skincomp` save/fresh-restore flow. The saved project is [skin-composition-mocomoco-64.skincomp](./skin-composition-mocomoco-64.skincomp); its SHA-256 is `e6f80c0dfb6265cbf7ae06c4cd73d224187585e0e7cf7758f145a2249584472f` (20,274,549 bytes). Input provenance is in [SOURCE-PROVENANCE.md](./SOURCE-PROVENANCE.md), and measured outcomes are in [RESULT.json](./RESULT.json).

The actual Chrome screenshots for Host-only, flowers, Host-hidden flowers+branches, and fresh restore were captured and displayed inline in the task. They are not local PNG files: the browser policy rejected the attempted `data:` URL image handoff, so no alternate browser route was used to persist them. This is the remaining evidence-packaging limitation.

The implementation and evidence are committed locally on `agent/skin-mocomoco-composition-v0`. One ordinary push was attempted and failed because the machine has no GitHub Git credentials (`SEC_E_NO_CREDENTIALS`); a read-only branch search confirmed the remote branch is not published. No API-based ref update, force push, merge, or deployment was used.

Open `http://127.0.0.1:5187/skin-rebuild.html?mode=composition` while the local dev server is running. The project is an unverified permanent-structure draft; it does not prove containment, strength, fabrication, removability, or printability. No STL/3MF/G-code, slicing, printer send, or print output is produced.
