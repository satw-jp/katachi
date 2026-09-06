# C — First Physical Print Artifact Archive v0

Date: 2026-09-06
Owner: C SOL
Execution owner: C LUNA / bounded file-organization worker
Status: ACTIVE / NON-CODE

## Purpose

Archive the exact Bambu Studio 3MF that produced the accepted First Physical Print, including the author's limited manual supplemental support edits, out of the temporary Codex handoff directory and into stable SKIN C Physical Evidence storage.

This is evidence preservation only. Do not modify geometry, slicer settings, support geometry, repo code, or Production semantics.

## Source

Windows / Google Drive mounted source directory:

`J:\My Drive\codex\2026-09-06\files-pasted-by-the-user-temporary\outputs\production-v0-support-wiring-fix-v0\3MF`

Inspect this directory first and identify the relevant `.3mf` artifact(s).

Important provenance note:

- the file was originally exported from the C Production / support wiring flow;
- the author subsequently opened it in Bambu Studio and added limited manual supplemental support at author-identified fragile regions;
- that edited Bambu Studio state overwrote the earlier file at this path;
- therefore the archived file must NOT be labeled `original` or claimed to be the untouched SKIN export;
- it IS the authoritative author-edited Bambu Studio artifact for the successful 2026-09-06 First Physical Print.

## Destination

Google Drive stable evidence folder already created by C SOL:

`ChatGPT/SKIN/_C/Physical Evidence/2026-09-06_First_Physical_Print/`

Drive folder id:

`1zP4y5hC2wI4k8wXSZxyEJdqplPLQ48f7`

Expected local mounted path, if Google Drive Desktop exposes the same hierarchy:

`J:\My Drive\ChatGPT\SKIN\_C\Physical Evidence\2026-09-06_First_Physical_Print\`

If the local mounted path differs, resolve the existing Drive folder by folder name / Drive id rather than creating a duplicate tree.

Create a `3MF` subfolder there if useful.

## Required procedure

1. Read-only inventory the source directory.
2. For each relevant `.3mf`, record filename, byte size, modified timestamp, and SHA-256 before any move/delete.
3. Copy the artifact into the stable evidence destination first.
4. Do not re-save it through Bambu Studio or any slicer.
5. Verify destination byte size and SHA-256 are identical to source.
6. Rename only if needed for evidence clarity; if renaming, preserve the original filename in the manifest.
7. Create a small UTF-8 manifest in the evidence folder, e.g. `FIRST_PHYSICAL_PRINT_3MF_MANIFEST.md`, containing:
   - date: 2026-09-06
   - source path
   - destination path
   - original filename
   - archived filename
   - byte size
   - SHA-256
   - provenance: `C Production artifact edited in Bambu Studio with limited manual supplemental support before the successful First Physical Print`
   - explicit note: `untouched pre-Bambu original is not preserved at this source path`
   - First Physical Gate result: `PASS / CLOSED for current print semantics`
   - limitation: `SKIN-support-alone full printability remains UNVERIFIED`
8. Only after copy + hash verification, remove the corresponding file from the temporary source if safe. If deletion is uncertain, leave the temp copy and report `DUPLICATE RETAINED`; evidence preservation has priority over cleanup.
9. Do not move unrelated files from the temporary tree.

## Protected scope

Do not:

- alter the `.3mf` contents;
- open and resave in Bambu Studio;
- regenerate supports;
- modify C Production code;
- modify BODY / Graph / Stage8 Support / export semantics;
- merge/rebase any branch;
- treat this artifact as proof of SKIN-support-alone printability.

## Done when

- the exact author-edited Bambu Studio `.3mf` is present in the stable Drive evidence folder;
- SHA-256 and byte size match the source copy;
- provenance manifest exists;
- temporary-file cleanup status is explicit;
- LUNA returns a compact handoff with source filename, destination, SHA-256, size, and cleanup status.

No Git commit is required for the 3MF itself. Do not add the binary 3MF to the repository.
