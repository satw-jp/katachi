# Request key provenance boundary correction

PR #53 corrected semantic policy/NON-KEY provenance separation; accepted trace preserved. Actual read-only adapter COMPLETE, production generator1, Bambu/ProcMon0.238 tests PASS (new boundary processes0; unchanged legacy fake/helpers19). Old trace-derived key SUPERSEDED. [Current correction/key authority](../../docs/evidence/SLICE_CONSOLE_R01_REQUEST_KEY_PROVENANCE_BOUNDARY_FIX_2026-10-05.md). Checkpoints below are historical.

STOP: SLICE CONSOLE R0.1 REQUEST KEY PROVENANCE BOUNDARY FIX — AUTHOR REVIEW.

# Elevated exact-route request identity checkpoint

REQUEST_IDENTITY COMPLETE; observed resource coverage COMPLETE, pinned policy0.2, actual adapter COMPLETE/key generated once. [Evidence](../../docs/evidence/SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05.md). Bambu1 normal-token diagnostic slice; retry/send/print/cache/REUSE0.234 tests PASS. Raw full-system PML local-only; exact-PID export only in Git.

STOP: SLICE CONSOLE R0.1 ELEVATED EXACT-ROUTE RESOURCE TRACE — AUTHOR REVIEW.

# Exact-route trace gate checkpoint

HOLD / TRACE_TOOL_UNAVAILABLE before launch; engine0, slice0.13 preflight identities PASS; frozen expectation saved. Policy/adapter unchanged; key null. [Evidence](../../docs/evidence/SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05.md).

STOP: SLICE CONSOLE R0.1 EXACT-ROUTE RESOURCE TRACE — AUTHOR REVIEW.

# A1 request resource coverage checkpoint

HOLD / REQUEST_RESOURCE_COVERAGE_UNRESOLVED. Policy/adapter unchanged; actual key null. [Decision](../../docs/evidence/SLICE_CONSOLE_R01_A1_RESOURCE_COVERAGE_2026-10-04.md).

STOP: SLICE CONSOLE R0.1 A1 REQUEST RESOURCE COVERAGE — AUTHOR REVIEW.

# CURRENT — Package G-code

- Slice経路は変更していない。独立したGUIタブと `package_gcode.py` を追加。
- Phase Bのsliced-only構造を基に、実際のBambu sliced packageから空の3MFモデルとrelationship、source 3MFからproject/plate metadataを使用。
- 13,184,604 byteの実G-code fixture: CRC PASS、150層、埋め込みSHA256一致、Bambu Studio Previewでlayer sliderとtoolpath表示。
- G-codeだけのmetadata生成はBambu Studioで拒否されたため、元の3MF設定を必須としfail closedにした。
- MINIA: `PACKAGE_RESULT.json` でCRC、674,530,071 bytes、778層、元/埋め込みSHA256一致を確認。Bambu Studio Previewで778層、Z 155.8 mm、toolpath、A1 mini、Generic PLAを確認した。`DELIVERY_READY / AUTHOR PRINT GATE`。印刷開始なし。
- 全26 unittest PASS。GUIのTk実起動smokeは、この実行環境のPythonにTcl runtimeがないため未実施。
- FOLLOW-UP: G-code以外のcontextがない場合にBambu Studioが受け入れる最小metadata集合の実証。
