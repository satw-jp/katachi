import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function text(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const html = text("../../../../skin-rebuild.html");
const main = text("../main.ts");
const ui = text("../ui.ts");
const renderer = text("../renderer.ts");
const style = text("../style.css");
const lowestWorker = text("./lowestPoint.worker.ts");
const lowestProtocol = text("./lowestPointWorkerProtocol.ts");
const parallelMesh = text("../parallelMeshBuffers.ts");
const exportMeshSourceStart = main.indexOf("function exportMesh(");
const exportMeshSourceEnd = main.indexOf("function cloneOpeningRequest(", exportMeshSourceStart);
assert.ok(exportMeshSourceStart >= 0 && exportMeshSourceEnd > exportMeshSourceStart, "exportMesh source is present");
const exportMeshSource = main.slice(exportMeshSourceStart, exportMeshSourceEnd);

assert.match(html, /data-skin-app="rebuild"/);
assert.match(html, /src="\/src\/studies\/skin\/main\.ts"/);
assert.doesNotMatch(html, /src\/studies\/skin\/rebuild\/main\.ts/);

for (const label of [
  "1. Base Shape / FORM",
  "育て直す (Grow)",
  "S1 レシピを読み込む",
  "2. Surface Pattern",
  "ランダムPACK",
  "Surface Pattern / motif shape",
  "この設定で表面を生成",
  "パッチを手で追加 (クリック)",
]) assert.ok(ui.includes(label), `original Stage 1/2 control is missing: ${label}`);

assert.match(main, /skin-project-bar/);
assert.match(main, /skin-left-pane/);
assert.match(main, /skin-right-pane/);
assert.match(main, /skin-bottom-status-pane/);
assert.match(main, /skin-rebuild-original-stage2\.fkei/);
assert.match(main, /skin-rebuild-first-print\.fkei/);
assert.match(main, /完成 Sample/);
assert.match(main, /Axome roll調整/);
assert.match(main, /水平に戻す/);
assert.match(main, /camera\.upだけを調整します。モデル・プレート座標・書き出しは変わりません/);
assert.match(
  main,
  /if \(isSkinRebuildApp\) ui\.historyIoRoot\.remove\(\);[\s\S]{0,120}else projectActions\.appendChild\(ui\.historyIoRoot\);/,
  "REBUILD must hide only the legacy JSON controls while the original SKIN entry point retains them",
);
assert.match(ui, /onExport: \(\) => void/,
  "removing the REBUILD controls must not remove the shared internal history export callback");
assert.match(ui, /onImportFile: \(file: File\) => void/,
  "removing the REBUILD controls must not remove the shared internal history import callback");
assert.match(renderer, /setSelectedAxomeRollDegrees/);
assert.match(renderer, /slot\.direction !== "axome"/,
  "roll adjustment must be unavailable for Top, Front, and side cameras");
for (const label of [
  "3. Base Shape側をinsideとして判定",
  "4. オーバーハング部を検出",
  "5A. ラティスを1パス追加",
  "選択した赤面を処理",
  "指定数をワンクリックで蜘蛛支持",
  "蜘蛛支持の未支持をワンクリックで0にする",
  "未支持点を黄色で強調",
  "未接続Patternをワンクリックで0にする",
  "選択した黄色の線を削除",
  "メイン画面の選択対象",
  "表面パターン",
  "蜘蛛ラティス線＋赤面",
  "5B. 選択赤面を面→点の水色立体で補強",
  "6. 作品をメッシュ化して確定",
  "7. 確定作品を診断して残る赤を表示",
  "8. Outside Overhangに印刷サポートを生成",
  "Removable Support",
  "Off",
  "Automatic",
  "Removable support disabled",
  "unsupported regions may remain",
  "BODY only",
  "サポート確定後の3Dデータを書き出す",
  "SKIN REBUILD完成.fkeiを保存",
]) assert.ok(main.includes(label), `SKIN REBUILD pipeline action is missing: ${label}`);
for (const label of [
  "Surface Patternの内外を決める",
  "オーバーハング部を検出",
  "蜘蛛ラティスと赤面エリア補強",
  "作品形状の確定",
  "作品の最終診断",
  "残っている赤へ印刷サポート",
]) assert.ok(main.includes(label), `SKIN REBUILD author stage is missing: ${label}`);
assert.match(main, /skinRebuildPipelineOutputBlockReason/);
assert.match(main, /keepInternalGraphVisibleInMesh\(message\.graph\)/, "Dry Web completion must preserve the graph in an already-active mesh view");
assert.match(main, /keepInternalGraphVisibleInMesh\(getInternalStructureGraph\(\)\)/, "mesh installation must preserve an existing Dry Web");
assert.match(
  main,
  /const rebuildGraphIsObservable = isSkinRebuildApp[\s\S]*?project\?\.finalGraph\.edges\.length/,
  "a generated REBUILD graph must remain observable even when the legacy Internal Structure setting is none",
);
assert.match(
  main,
  /function installSkinRebuildPermanentLatticePreview[\s\S]*?setInternalStructure\(project\.finalGraph\)[\s\S]*?setPrintSupport\(null\)[\s\S]*?keepInternalGraphVisibleInMesh\(project\.finalGraph\)/,
  "Stage 5A must reveal the permanent cyan lattice before separate print support exists",
);
assert.match(
  main,
  /skinRebuildPipeline\.project = project;[\s\S]{0,300}?installSkinRebuildPermanentLatticePreview\(project, true\)/,
  "each Stage 5A build must reinstall its current lattice preview",
);
assert.match(main, /new Worker\(new URL\("\.\/rebuild\/lowestPoint\.worker\.ts"/);
assert.match(main, /beginHeavyComputation\(`工程4 オーバーハング検出/);
assert.match(main, /オーバーハング危険面を表示（Inside赤／Outside薄青灰）/);
assert.match(main, /Inside赤=5B対象、Outside薄青灰=診断のみ、緑=Inside補強済み、水色=補強部材/);
assert.match(main, /faceRegionIds: overhangInterior\.insideFaceRegionIds/,
  "Stage 5B surface sampling must receive only the Stage 3-derived Inside Overhang mask");
assert.match(renderer, /setSkinRebuildOverhangOverlay/);
assert.match(renderer, /setReinforcedSkinRebuildOverhangRegions/);
assert.match(renderer, /skin-rebuild-reinforced-overhang-regions/);
assert.match(renderer, /0x34e39a/, "reinforced overhang regions must use a persistent green overlay");
assert.match(renderer, /setReinforcedInternalStructureEdges/);
assert.match(renderer, /skin-rebuild-red-area-reinforcement-cyan/);
assert.match(renderer, /0x32e6ff/, "new red-area reinforcement members must remain visibly bright cyan");
assert.match(renderer, /skin-rebuild-unsupported-target-/,
  "the export-blocking lowest point must have a large depth-independent yellow/white marker");
assert.match(main, /focusSkinRebuildUnsupportedTarget/,
  "the export failure and Stage 5A controls must focus the exact unsupported Pattern id");
assert.match(main, /bottomWorkflowGeneration\.textContent/);
assert.match(main, /pendingMeshExportAfterGate/, "Stage 6 must auto-run the required Internal gate");
assert.match(main, /cachedStl: reusableGate\?\.stl\.slice\(0\)/, "Stage 6 must reuse the exact gate-approved STL");
assert.match(main, /setSkinRebuildMeshBottomProgress\("工程6/, "Stage 6 must report into the bottom pane");
assert.match(main, /stage6MeshProgressPercent/, "Stage 6 must show worker phases instead of time-smoothed progress");
assert.match(main, /stage6BodyMeshCache/, "Stage 6 must retain an inspected BODY mesh for exact export reuse");
assert.match(main, /prebuiltPositions: reusablePreview/, "the Internal gate must accept the inspected BODY triangles");
assert.match(main, /function showSkinRebuildStage6ArtworkMesh[\s\S]*?setMeshOverlayBuffers\(positions, normals\)/,
  "Stage 6 must replace the stale surface preview with the exact meshed artwork");
assert.match(main, /function showSkinRebuildStage6ArtworkMesh[\s\S]*?setSkinRebuildReinforcementPreview\(null, \[\]\)/,
  "Stage 6 must remove the temporary bright-cyan overlay after its geometry enters the artwork mesh");
assert.match(main, /工程5A＋5Bの恒久Graph .*辺を作品meshへ統合・表示/,
  "Stage 6 must explicitly report that permanent red-area reinforcement entered the artwork mesh");
assert.match(parallelMesh, /positionsOnly: true[\s\S]*?flatNormalsFromTriangleSoup\(buffers\.positions\)/,
  "the parallel Stage 6 path must rebuild display normals after positions-only slice transfer");
assert.match(ui, /工程5Bの赤面補強を一体の作品メッシュへ合成/);
assert.match(main, /printSupportGraph/, "removable print support must travel separately from BODY");
assert.match(main, /const supportGraph = modeAtStart === "automatic"/,
  "Stage 8 must retain an explicit Automatic branch");
assert.match(main, /buildSparseRemovableSupport\(/,
  "Automatic must use the focused sparse removable-support builder path");
assert.match(main, /projectSkinRebuildFinalArtworkOverhangToStage4\([\s\S]{0,500}?diagnosis\.overhangFacePositions[\s\S]{0,500}?responsibilityOverhang\.positions/,
  "Stage 8 must transfer current Stage 7 positions onto the retained Stage 4 responsibility SSOT");
assert.match(main, /projectedOutsideFaces[\s\S]{0,400}?responsibilityRegionId/,
  "Automatic removable support must route only projected Stage 4 Outside faces grouped by region");
assert.match(main, /projectedOutsideFaces[\s\S]{0,500}?ownerPatchId: face\.responsibilityOwnerPatchId/,
  "Automatic removable support must preserve the selected Stage 3 owner Patch id");
assert.match(main, /otherBodySdfByOwner[\s\S]{0,900}?internalGraph: current\.finalGraph/,
  "Automatic removable support must screen the non-owner BODY plus permanent graph independently");
assert.match(main, /Without an[\s\S]{0,180}?explicit finite plateBounds[\s\S]{0,180}?leaning routes are therefore[\s\S]{0,80}?unavailable/,
  "Automatic must not infer physical plate XY bounds from sampling bounds");
assert.match(main, /Inside-derived 0/,
  "Stage 8 must expose that Inside-derived removable support stays zero");
assert.match(main, /Sparse Automatic \(experimental\)/,
  "Automatic must remain visibly experimental");
assert.match(main, /Stage 8 debug（黄色=Critical Target \/ 赤=Rejected Candidate）/,
  "Stage 8 must expose the bounded debug toggle");
assert.match(renderer, /0xffd23f/, "Critical Target markers must remain yellow");
assert.match(renderer, /0xff304d/, "Rejected Candidate markers must remain translucent red");
assert.match(main, /skinRebuildPrintSupportMode === "off"[\s\S]*?createEmptySkinRebuildGraph/,
  "Off must install an empty support graph without calling the builder");
assert.match(main, /internalPrintGateAllowsSupportDisabledExport/,
  "support-disabled export must use the explicit Internal-gate policy helper");
assert.match(
  main,
  /function stopSkinRebuildStage8Export\(reason: string\): void \{[\s\S]{0,260}?textContent = `書き出し停止: \$\{reason\}`;[\s\S]{0,120}?dataset\.ok = "false";[\s\S]{0,120}?refreshSkinRebuildStage8ExportButton\(\);/,
  "a Stage 8 export block must replace an in-progress status with a failed status and refresh the controls",
);
for (const [label, pattern] of [
  ["pipeline output", /if \(rebuildBlockReason\)[\s\S]*?stopSkinRebuildStage8Export\(rebuildBlockReason\)[\s\S]*?return;/],
  ["Internal readiness", /if \(readinessBlockReason\)[\s\S]*?stopSkinRebuildStage8Export\(readinessBlockReason\)[\s\S]*?return;/],
  ["Internal gate", /if \(!internalPrintGateExportAllowed\(internalPrintGateCache\.report\)\)[\s\S]*?stopSkinRebuildStage8Export\(gateBlockReason\)[\s\S]*?return;/],
] as const) {
  assert.match(exportMeshSource, pattern, `Stage 8 export must stop visibly on ${label} blockers`);
}
assert.match(main, /getSkinRebuildPrintSupportGraph[\s\S]*?skinRebuildPrintSupportMode === "automatic"/,
  "support artifacts must be omitted from output while Off is selected");
assert.match(main, /acceptedSupportCount/, "Stage 8 must expose accepted support diagnostics");
assert.match(main, /rejectedByBodyIntersection/, "Stage 8 must expose Body-intersection rejection diagnostics");
assert.match(main, /unsupportedCount/, "Stage 8 must expose explicit unsupported diagnostics");
assert.match(main, /rejected-by-Body/, "Stage 8 must label Body-intersection rejections");
assert.match(main, /mergePrintableSupportIntoBody: false/, "SKIN REBUILD 3MF must keep artwork and print support as separate parts");
assert.match(main, /skin-rebuild-export-formats/,
  "Stage 8 must offer explicit 3MF, STL and OBJ selections next to the final export action");
assert.match(main, /formats\.threeMf[\s\S]*?formats\.stl[\s\S]*?formats\.obj/,
  "the final exporter must retain the chosen output-format set through the audited worker path");
assert.match(main, /commitSkinRebuildWorkflowHistory\("工程8 印刷サポート生成"/,
  "Stage 8 must enter the shared top-bar workflow undo journal");
assert.match(main, /requestProjectUndo[\s\S]*?undoSkinRebuildWorkflowOperation/,
  "the top Undo action must route completed SKIN REBUILD operations before legacy shape history");
assert.match(main, /requestProjectRedo[\s\S]*?redoSkinRebuildWorkflowOperation/,
  "the top Redo action must restore an undone SKIN REBUILD operation");
assert.match(main, /diagnoseSkinRebuildArtworkForPrintSupport/, "print support must use the edited artwork mesh diagnosis");
assert.match(main, /skinRebuildFinalArtworkDiagnosis = \{ \.\.\.diagnosedArtwork, project \}/,
  "Stage 7 must retain the finalized artwork diagnosis");
assert.match(main, /projectSkinRebuildFinalArtworkOverhangToStage4\([\s\S]*?diagnosis\.overhangFacePositions/,
  "Stage 7 final-artwork targets must be transferred to the retained Stage 4 responsibility");
assert.match(main, /buildSparseRemovableSupport\(/,
  "Stage 8 must use the sparse builder after the Stage 7 transfer");
assert.match(main, /工程7で残った赤面があります。工程8で別体印刷サポートを生成してください/);
assert.match(main, /pickMotifLowestPointMarker/, "red lowest-point markers must be selectable in the main viewport");
assert.match(main, /skinRebuildViewportSelectionMode === "lattice-edge"/,
  "the left-pane selection mode must route viewport clicks to lattice members");
assert.match(main, /aria-label", "蜘蛛ラティス線と赤面を選択"/,
  "the combined left-pane mode must advertise both lattice-line and red-region picking");
assert.match(main, /pickSkinRebuildOverhangRegion\(e\.clientX, e\.clientY\)/,
  "both main-viewport modes must hit-test the actual connected red-face region");
assert.match(main, /aria-label", "赤面エリアをドラッグで複数選択"/,
  "the left pane must expose an explicit multi-region drag selection mode");
assert.match(main, /e\.ctrlKey \|\| e\.metaKey \? "remove" : e\.shiftKey \? "add" : "replace"/,
  "red-region clicks must support Shift add and Ctrl remove semantics");
assert.match(main, /A Shift-click directly on red belongs to multi-selection, not camera pan/,
  "Shift-click selection must preempt the Axome camera pan gesture on an actual red face");
assert.match(main, /pickSkinRebuildOverhangRegionsInClientRect/,
  "drag selection must select every projected red triangle overlapping the visible rectangle");
assert.match(main, /skin-rebuild-region-marquee/,
  "drag selection must show a reference rectangle in the main viewport");
assert.match(main, /selectedRegions\.map\(\(region\) =>/,
  "Stage 5B must send every selected unreinforced red region to the background calculation");
assert.match(renderer, /setSelectedSkinRebuildOverhangRegions/,
  "the renderer must highlight multiple connected red regions at once");
assert.match(main, /pickInternalStructureEdge\(e\.clientX, e\.clientY, graph\)/,
  "a lattice-mode viewport click must use the rendered permanent edge instances");
assert.match(main, /stage5bReinforcement\.worker\.ts/,
  "Stage 5B must add its solid face-to-web route outside the interaction thread");
assert.match(renderer, /pickInternalStructureEdge/,
  "the renderer must expose hit-tested permanent lattice-edge picking");
assert.match(renderer, /pointSegmentDistanceSq/,
  "lattice picking must compare the cursor with the screen-projected visible line");
assert.match(renderer, /pickSkinRebuildOverhangRegion/,
  "the renderer must map a red triangle hit back to its connected region");
assert.match(renderer, /screenTriangleIntersectsRect/,
  "rectangle picking must test actual projected red triangles, not sparse cursor samples");
assert.match(renderer, /regionIds\[faceIndex\]/,
  "red-face region picking must use the worker's per-face connected-region ids");
assert.match(
  main,
  /opening the left tools pane makes the visible line and click ray diverge[\s\S]{0,120}skinRenderer\.resize\(\)/,
  "left-pane collapse/restore must resize WebGL before the next coordinate pick",
);
assert.match(main, /refreshSkinRebuildLatticeEdgeEditor\(\);[\s\S]{0,240}setSkinRebuildLatticeEdgeSelection\(null\);/,
  "deleting a compacted lattice edge must clear selection instead of selecting a different line");
assert.match(main, /preferredConnectivityPatchIds/, "selected non-spider red faces must be connectable without inventing spider support");
assert.match(main, /skinRebuildGateSafeMeshOptions/, "Stage 6 must raise under-resolved author settings before the Internal gate");
assert.match(main, /mergeSkinRebuildGraphsAtSupportContacts/, "the gate must recognize physical support contacts along artwork members");
assert.match(ui, /resolutionInput\.max = "256"/, "0.8 mm support needs a resolution-256 representation option");
assert.match(ui, /defaultTargetLongestMmForSkinApp\(isSkinRebuildApp\)/,
  "new SKIN REBUILD sessions must use the explicit 120 mm author scale policy");
assert.match(ui, /dataset\.skinRebuildScalePreset/,
  "REBUILD must expose an explicit 120 mm / 1.5x preset");
assert.match(main, /targetLongestMm: ui\.getMeshOptions\(\)\.targetLongestMm/,
  "the REBUILD pipeline must bind geometry diagnostics to the visible physical size");
assert.match(main, /targetLongestMm: project\.settings\.targetLongestMm/,
  "opening a legacy FKEI must restore its saved target size instead of silently applying 120 mm");
assert.match(main, /onOpeningMapConditionsChange:[\s\S]*?skinRebuildPhysicalSettingsChanged\(skinRebuildPipeline\.settings[\s\S]*?invalidateSkinRebuildPipeline/,
  "changing physical size must invalidate Stage 3-8 state even before a project exists");
assert.match(main, /diameter\.addEventListener\("change"/,
  "changing the permanent lattice diameter must invalidate stale project geometry");
assert.match(main, /supportDiameter\.addEventListener\("change"/,
  "changing the removable support diameter must invalidate stale project settings");
assert.match(main, /ラティスまたは印刷サポートの直径が工程3〜5と一致しません/,
  "exports must fail closed when visible diameter settings differ from the project");
assert.match(main, /skinRebuildSettingsChanged\(settings, currentSkinRebuildPipelineSettings\(\)\)/,
  "Stage 4 must discard an asynchronous result when any captured setting changed");
assert.match(lowestWorker, /buildParallelSkinMesh/);
assert.match(lowestWorker, /findSkinRebuildLowestPoints/);
assert.match(lowestProtocol, /chooseSkinRebuildLowestWorkerCount/);
assert.match(renderer, /setViewportMode\("four"/);
assert.match(renderer, /fourViewsButton\.textContent = "4"/);
assert.match(style, /\.multi-viewport-layout-toggle/);
assert.match(style, /\.skin-bottom-status-pane/);
assert.match(style, /\.skin-rebuild-pipeline-panel/);

console.log("SKIN REBUILD original editor shell tests passed");
