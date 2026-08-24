import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { buildBambu3mf, parseBinaryStlPositions } from "../src/studies/skin/bambu3mf.ts";
import { buildExternalPerimeterScaffold, DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS, type ExternalScaffoldTarget } from "../src/studies/skin/externalScaffold.ts";
import { parseRecipe, replay } from "../src/studies/skin/history.ts";
import {
  buildSkinMesh,
  computeSkinMeshSamplingGrid,
  computeSkinSamplingBounds,
  countConnectedComponents,
  type SkinMeshFieldInput,
  type SkinMeshResult,
} from "../src/studies/skin/meshExport.ts";
import { inspectFusedScaffoldPlateAnchoring, normalizeFusedScaffoldPlatePlane, type SkinScaffoldPillar } from "../src/studies/skin/scaffoldFusion.ts";
import {
  buildMeshResultFromTriangles,
  inspectSavedStlTopology,
  inspectWatertight,
  meshGridShape,
  orientMeshForSavedStl,
  roundVertexToF32,
  summarizeSavedStlComponents,
  type Triangle,
} from "../src/studies/cloud-sculpt/meshExport.ts";
import { createCompositeSdfEvaluator } from "../src/studies/skin/field.ts";
import { diagnoseSurfaceAnglePositions } from "../src/studies/skin/surfaceAngleDiagnosis.ts";
import { buildTargetedGridInternalStructure } from "../src/studies/skin/targetedGrid.ts";
import { buildVoronoiInternalStructure } from "../src/studies/skin/voronoi.ts";
import { evaluateInternalPrintGate } from "../src/studies/skin/internalPrintGate.ts";
import { filterSupportEnforcerReachability } from "../src/studies/skin/supportReachability.ts";
import { assignOverhangSupportTargets, validateOverhangAssignmentLedger } from "../src/studies/skin/overhangSupportPolicy.ts";
import { buildOverhangSupportDiagnostic } from "../src/studies/skin/overhangSupportDiagnostic.ts";
import { parseBodyProvenance, validateBodyProvenanceGraph, validateBodyProvenanceInput } from "../src/studies/skin/bodyProvenance.ts";
import {
  assertResolvedPrintPlanSupportCounts, bboxFromPositionsMm, buildPrintValidationFacts, geometryFingerprintLowResolution, printProfileSha256,
  resolveCliPrintPlan, validateSkinPrintProfile, type ResolvedPrintPlan, type SkinPrintProfileV1,
} from "../src/studies/skin/printProfile.ts";

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const planOnly = process.argv.includes("--plan-only");
const recipePath = option("--recipe");
const outputPath = option("--output");
const profilePath = option("--profile");
const validationPath = option("--validation");
const bodyStlPath = option("--body-stl");
const bodyProvenancePath = option("--body-provenance");
const sliceFeedbackReportPath = option("--slice-feedback-report");
const sliceFeedbackStlPath = option("--slice-feedback-stl");
const overhangDiagnosticPath = option("--overhang-diagnostic");
const diagnosticOnly = process.argv.includes("--diagnostic-only");
if (!recipePath || !outputPath || !resolve(recipePath).startsWith("/") || !resolve(outputPath).startsWith("/")) {
  throw new Error("Usage: npx tsx scripts/export-skin-bambu-3mf.ts --recipe <absolute JSON> --output <absolute .3mf> [--body-stl <absolute binary STL> --body-provenance <absolute JSON>]");
}
let targetLongestMm = Number(option("--targetLongestMm", "80"));
let resolution = Math.max(16, Math.round(Number(option("--resolution", "128"))));
let fusedResolution = Math.max(resolution, Math.round(Number(option("--fusedResolution", "160"))));
let thresholdDeg = Number(option("--thresholdDeg", "45"));
// v088's removable foot is 2.4 mm in diameter (the legacy scaffold default
// remains unchanged in externalScaffold.ts for old callers).
let scaffoldBaseRadiusMm = Number(option("--scaffoldBaseRadiusMm", "1.2"));
const supportType = option("--supportType", "normal(manual)") as "normal(manual)";
let requestedWorkers = Math.max(
  1,
  Math.round(Number(option("--workers", String(Math.min(8, availableParallelism()))))),
);
if (profilePath && !profilePath.startsWith("/")) throw new Error("--profile must be an absolute path");
if (validationPath && !validationPath.startsWith("/")) throw new Error("--validation must be an absolute path");
const profileForbiddenOverrides = ["--targetLongestMm", "--resolution", "--fusedResolution", "--thresholdDeg", "--scaffoldBaseRadiusMm", "--supportType", "--workers", "--slice-feedback-report", "--slice-feedback-stl"].filter((name) => process.argv.includes(name));
if (profilePath && profileForbiddenOverrides.length > 0) throw new Error("Fail closed: --profile forbids unrecorded CLI overrides: " + profileForbiddenOverrides.join(", "));
if (bodyStlPath && !bodyStlPath.startsWith("/")) throw new Error("--body-stl must be an absolute path");
if (bodyProvenancePath && !bodyProvenancePath.startsWith("/")) throw new Error("--body-provenance must be an absolute path");
if (Boolean(bodyStlPath) !== Boolean(bodyProvenancePath)) throw new Error("--body-stl and --body-provenance must be supplied together");
if (Boolean(sliceFeedbackReportPath) !== Boolean(sliceFeedbackStlPath)) throw new Error("--slice-feedback-report and --slice-feedback-stl must be supplied together");
if (sliceFeedbackReportPath && !sliceFeedbackReportPath.startsWith("/")) throw new Error("--slice-feedback-report must be an absolute path");
if (sliceFeedbackStlPath && !sliceFeedbackStlPath.startsWith("/")) throw new Error("--slice-feedback-stl must be an absolute path");
if (overhangDiagnosticPath && !overhangDiagnosticPath.startsWith("/")) throw new Error("--overhang-diagnostic must be an absolute path");
if (diagnosticOnly && !overhangDiagnosticPath) throw new Error("--diagnostic-only requires --overhang-diagnostic");
if (!Number.isFinite(targetLongestMm) || targetLongestMm <= 0 || !Number.isFinite(fusedResolution) || !Number.isFinite(thresholdDeg) || !Number.isFinite(requestedWorkers) || !Number.isFinite(scaffoldBaseRadiusMm) || scaffoldBaseRadiusMm < DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS.shaftRadiusMm || supportType !== "normal(manual)") throw new Error("Invalid numeric, worker, scaffold base, or supportType option: porous SKIN accepts only normal(manual)");

const stage = (name: string): void => console.error("stage: " + name);
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function mmTriangles(positions: Float32Array): Triangle[] {
  if (positions.length % 9 !== 0 || positions.length === 0) throw new Error("Fail closed: BODY STL triangle soup is empty or corrupt");
  const triangles: Triangle[] = [];
  for (let offset = 0; offset < positions.length; offset += 9) {
    const values = Array.from(positions.subarray(offset, offset + 9));
    if (!values.every(Number.isFinite)) throw new Error("Fail closed: BODY STL has non-finite coordinates");
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = values;
    const abx = bx - ax; const aby = by - ay; const abz = bz - az;
    const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
    if (Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) === 0) throw new Error("Fail closed: BODY STL has an exactly zero-area triangle");
    triangles.push({ a: { x: ax, y: ay, z: az }, b: { x: bx, y: by, z: bz }, c: { x: cx, y: cy, z: cz } });
  }
  return triangles;
}

function longestExtentMm(positions: Float32Array): number {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let offset = 0; offset < positions.length; offset += 3) {
    minX = Math.min(minX, positions[offset]); minY = Math.min(minY, positions[offset + 1]); minZ = Math.min(minZ, positions[offset + 2]);
    maxX = Math.max(maxX, positions[offset]); maxY = Math.max(maxY, positions[offset + 1]); maxZ = Math.max(maxZ, positions[offset + 2]);
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ);
}
function positionsFromTriangles(triangles: Triangle[]): Float32Array {
  return new Float32Array(triangles.flatMap((triangle) => [
    triangle.a.x, triangle.a.y, triangle.a.z, triangle.b.x, triangle.b.y, triangle.b.z, triangle.c.x, triangle.c.y, triangle.c.z,
  ]));
}

function keepLargestSavedTriangleComponent(triangles: Triangle[], scaleMmPerUnit: number): { triangles: Triangle[]; removedTriangleCount: number } {
  if (triangles.length < 2) return { triangles, removedTriangleCount: 0 };
  const parent = new Int32Array(triangles.length);
  const sizes = new Int32Array(triangles.length);
  for (let index = 0; index < triangles.length; index++) { parent[index] = index; sizes[index] = 1; }
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) { const next = parent[value]; parent[value] = root; value = next; }
    return root;
  };
  const union = (a: number, b: number): void => {
    let rootA = find(a); let rootB = find(b);
    if (rootA === rootB) return;
    if (sizes[rootA] < sizes[rootB]) { const swap = rootA; rootA = rootB; rootB = swap; }
    parent[rootB] = rootA; sizes[rootA] += sizes[rootB];
  };
  const owner = new Map<string, number>();
  for (let index = 0; index < triangles.length; index++) {
    const triangle = triangles[index];
    for (const vertex of [triangle.a, triangle.b, triangle.c]) {
      const rounded = roundVertexToF32(vertex, scaleMmPerUnit);
      const key = String(rounded.x) + "," + String(rounded.y) + "," + String(rounded.z);
      const previous = owner.get(key);
      if (previous === undefined) owner.set(key, index); else union(index, previous);
    }
  }
  const counts = new Map<number, number>();
  let largestRoot = -1; let largestCount = 0;
  for (let index = 0; index < triangles.length; index++) {
    const root = find(index); const count = (counts.get(root) ?? 0) + 1; counts.set(root, count);
    if (count > largestCount) { largestCount = count; largestRoot = root; }
  }
  if (largestCount === triangles.length) return { triangles, removedTriangleCount: 0 };
  const kept = triangles.filter((_, index) => find(index) === largestRoot);
  return { triangles: kept, removedTriangleCount: triangles.length - kept.length };
}

function trianglesFromFloat64(positions: Float64Array): Triangle[] {
  if (positions.length % 9 !== 0) throw new Error("Parallel mesh slice returned a corrupt triangle buffer");
  const triangles = new Array<Triangle>(positions.length / 9);
  for (let offset = 0, index = 0; offset < positions.length; offset += 9, index++) {
    triangles[index] = {
      a: { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] },
      b: { x: positions[offset + 3], y: positions[offset + 4], z: positions[offset + 5] },
      c: { x: positions[offset + 6], y: positions[offset + 7], z: positions[offset + 8] },
    };
  }
  return triangles;
}

async function buildSkinMeshParallel(
  input: SkinMeshFieldInput,
  workerLimit: number,
): Promise<SkinMeshResult> {
  const grid = computeSkinMeshSamplingGrid(input);
  const { nz } = meshGridShape(grid.bounds, grid.resolution);
  const workerCount = Math.max(1, Math.min(workerLimit, nz));
  if (workerCount === 1) {
    return buildSkinMesh(
      input.mode, input.host, input.hostK, input.thickness, input.patches, input.roundK, input.options,
      input.coinBulge, input.quadMeshJoinWidth ?? 0, input.coinBulgeBalance ?? 0,
      input.internalGraph ?? null, input.scaffoldPillars ?? [],
    );
  }
  console.error(`mesh workers: ${workerCount} / z cubes ${nz} / resolution ${grid.resolution}`);
  const slices = await Promise.all(Array.from({ length: workerCount }, (_, sliceIndex) => new Promise<{
    sliceIndex: number;
    positions: ArrayBuffer;
    triangleCount: number;
  }>((resolveSlice, rejectSlice) => {
    const zStart = Math.floor((sliceIndex * nz) / workerCount);
    const zEnd = Math.floor(((sliceIndex + 1) * nz) / workerCount);
    const worker = new Worker(new URL("./export-skin-mesh-slice.worker.ts", import.meta.url), {
      execArgv: ["--import", "tsx"],
      workerData: { ...input, zStart, zEnd, sliceIndex },
    });
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      console.error(`mesh slice: ${message.sliceIndex + 1}/${workerCount} complete (${message.triangleCount} faces)`);
      resolveSlice(message);
    });
    worker.once("error", rejectSlice);
    worker.once("exit", (code) => {
      if (settled) return;
      rejectSlice(new Error(
        code === 0
          ? `Mesh slice Worker ${sliceIndex + 1} exited without a result`
          : `Mesh slice Worker ${sliceIndex + 1} exited with code ${code}`,
      ));
    });
  })));
  slices.sort((a, b) => a.sliceIndex - b.sliceIndex);
  const triangles: Triangle[] = [];
  for (const slice of slices) {
    for (const triangle of trianglesFromFloat64(new Float64Array(slice.positions))) {
      triangles.push(triangle);
    }
  }
  const base = buildMeshResultFromTriangles(triangles, input.options.targetLongestMm);
  return {
    ...base,
    connectedComponents: countConnectedComponents(triangles),
    reinforcedConnectionPoints: grid.reinforcedConnectionPoints,
    internalEdgeCount: grid.internalEdgeCount,
  };
}

function boundsFromPositions(positions: Float32Array) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]); minY = Math.min(minY, positions[index + 1]); minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]); maxY = Math.max(maxY, positions[index + 1]); maxZ = Math.max(maxZ, positions[index + 2]);
  }
  return {
    min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    longest: Math.max(maxX - minX, maxY - minY, maxZ - minZ),
  };
}

async function loadSliceFeedbackTargets(reportPath: string, stlPath: string, bodyPositionsMm: Float32Array): Promise<ExternalScaffoldTarget[]> {
  const [reportText, stlBytes] = await Promise.all([readFile(reportPath, "utf8"), readFile(stlPath)]);
  const report = JSON.parse(reportText) as {
    schema?: string;
    boundsMm?: { minX?: number; minY?: number; maxX?: number; maxY?: number };
    floatingComponents?: Array<{ zMm?: number; centerMm?: { x?: number; y?: number }; source?: string }>;
  };
  const boundsMm = report.boundsMm;
  const components = report.floatingComponents;
  if (report.schema !== "katachi.bambu.gcode-layer-reachability.v1" || !boundsMm || !Array.isArray(components)) {
    throw new Error("Fail closed: slice feedback report schema is invalid");
  }
  const gcodeBounds = [boundsMm.minX, boundsMm.minY, boundsMm.maxX, boundsMm.maxY];
  if (!gcodeBounds.every(Number.isFinite)) throw new Error("Fail closed: slice feedback G-code bounds are invalid");
  const stlBuffer = stlBytes.buffer.slice(stlBytes.byteOffset, stlBytes.byteOffset + stlBytes.byteLength);
  const slicedMeshBounds = boundsFromPositions(parseBinaryStlPositions(stlBuffer));
  const gcodeCenterX = (Number(boundsMm.minX) + Number(boundsMm.maxX)) * 0.5;
  const gcodeCenterY = (Number(boundsMm.minY) + Number(boundsMm.maxY)) * 0.5;
  const bodyBounds = boundsFromPositions(bodyPositionsMm);
  const feedbackScale = bodyBounds.longest / slicedMeshBounds.longest;
  const bodyCenterX = (bodyBounds.min.x + bodyBounds.max.x) * 0.5;
  const bodyCenterY = (bodyBounds.min.y + bodyBounds.max.y) * 0.5;
  const plateZ = bodyBounds.min.z - DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS.plateAnchorDropMm;
  return components.map((component, index) => {
    const x = component.centerMm?.x;
    const y = component.centerMm?.y;
    const z = component.zMm;
    if (![x, y, z].every(Number.isFinite)) throw new Error("Fail closed: slice feedback component " + index + " is invalid");
    return {
      xMm: bodyCenterX + (Number(x) - gcodeCenterX) * feedbackScale,
      yMm: bodyCenterY + (Number(y) - gcodeCenterY) * feedbackScale,
      zMm: plateZ + Number(z) * feedbackScale,
      // A Bambu floating-shell target needs deeper overlap, but its contact cap
      // must never widen beyond the shaft. A wider spherical bulb creates a new
      // unsupported layer outline and is reported as another floating shell.
      ...(component.source === "BambuStudio Floating vertical shell"
        ? { contactRadiusMm: DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS.shaftRadiusMm, contactOverlapMm: 1.2 }
        : {}),
    };
  });
}

stage("replay");
const recipeBytes = await readFile(recipePath);
const recipeSha256 = sha256(recipeBytes);
const entries = parseRecipe(recipeBytes.toString("utf8"));
const state = replay(entries);
const internalStructure = state.skinParams.internalStructure;
if (internalStructure !== "targetedGrid" && internalStructure !== "voronoiEdge") throw new Error("Fail closed: recipe must enable an Internal Structure");
let activePrintProfile: SkinPrintProfileV1 | null = null;
let activePrintProfileSha256: string | null = null;
let printPlan: ResolvedPrintPlan | null = null;
if (profilePath) {
  stage("Print Profile");
  activePrintProfile = validateSkinPrintProfile(JSON.parse(await readFile(profilePath, "utf8")));
  activePrintProfileSha256 = await printProfileSha256(activePrintProfile);
  targetLongestMm = activePrintProfile.geometry.targetLongestMm;
  resolution = activePrintProfile.geometry.surfaceResolution;
  fusedResolution = activePrintProfile.geometry.fusedResolution;
  thresholdDeg = activePrintProfile.geometry.angleThresholdDeg;
  scaffoldBaseRadiusMm = activePrintProfile.scaffold.footRadiusMm;
  requestedWorkers = activePrintProfile.executionHints.workerCount;
  printPlan = resolveCliPrintPlan(activePrintProfile, activePrintProfileSha256, {
    recipeSha256, seed: state.hostParams.seed, currentInternalStructure: internalStructure,
    currentDryWebNormalizedRadius: state.skinParams.internalRadius, currentTargetLongestMm: targetLongestMm,
    currentSurfaceResolution: resolution, currentFusedResolution: fusedResolution, currentAngleThresholdDeg: thresholdDeg,
  });
}
let suppliedBody: {
  positions: Float32Array;
  watertight: ReturnType<typeof inspectWatertight>;
  savedBefore: ReturnType<typeof inspectSavedStlTopology>;
  savedAfter: ReturnType<typeof inspectSavedStlTopology>;
} | null = null;
let bodyProvenance: ReturnType<typeof parseBodyProvenance> | null = null;
let builtBodyTopology: {
  savedBefore: ReturnType<typeof inspectSavedStlTopology>;
  savedAfter: ReturnType<typeof inspectSavedStlTopology>;
} | null = null;
if (bodyStlPath && bodyProvenancePath) {
  stage("BODY provenance");
  const [bodyStlBytes, provenanceText] = await Promise.all([readFile(bodyStlPath), readFile(bodyProvenancePath, "utf8")]);
  try {
    bodyProvenance = parseBodyProvenance(JSON.parse(provenanceText));
  } catch (error) {
    throw new Error("Fail closed: BODY provenance JSON/schema invalid: " + (error as Error).message);
  }
  validateBodyProvenanceInput(bodyProvenance, {
    recipeSha256, bodyStlSha256: sha256(bodyStlBytes), targetLongestMm, resolution, internalStructure,
  });
  stage("BODY reuse validation");
  const bodyStlBuffer = bodyStlBytes.buffer.slice(bodyStlBytes.byteOffset, bodyStlBytes.byteOffset + bodyStlBytes.byteLength);
  const inputPositions = parseBinaryStlPositions(bodyStlBuffer);
  const inputTriangles = mmTriangles(inputPositions);
  const inputBounds = boundsFromPositions(inputPositions);
  const inputMesh = { triangles: inputTriangles, sourceBounds: inputBounds, mmBounds: inputBounds, scaleMmPerUnit: 1, watertight: inspectWatertight(inputTriangles, 1) };
  const savedBefore = inspectSavedStlTopology(inputTriangles, 1);
  const actualLongestMm = longestExtentMm(inputPositions);
  const toleranceMm = Math.max(0.02, targetLongestMm * 0.005);
  if (savedBefore.nonFiniteTriangleCount > 0 || !savedBefore.closed || !savedBefore.degenerateFree || savedBefore.connectedComponents !== 1 || Math.abs(actualLongestMm - targetLongestMm) > toleranceMm) {
    throw new Error("Fail closed: supplied BODY STL rejected before winding repair (closed=" + savedBefore.closed + ", degenerate=" + savedBefore.degenerateTriangleCount + ", nonFinite=" + savedBefore.nonFiniteTriangleCount + ", components=" + savedBefore.connectedComponents + ", open=" + savedBefore.openEdges + ", nonManifold=" + savedBefore.nonManifoldEdges + ", windingInconsistent=" + savedBefore.windingInconsistentEdges + ", longest=" + actualLongestMm.toFixed(3) + " mm, expected=" + targetLongestMm.toFixed(3) + "±" + toleranceMm.toFixed(3) + " mm)");
  }
  const repaired = orientMeshForSavedStl(inputMesh);
  const savedAfter = inspectSavedStlTopology(repaired.triangles, 1);
  if (!savedAfter.ok || savedAfter.connectedComponents !== 1) {
    throw new Error("Fail closed: supplied BODY STL winding repair failed (closed=" + savedAfter.closed + ", winding=" + savedAfter.windingConsistent + ", degenerate=" + savedAfter.degenerateTriangleCount + ", nonFinite=" + savedAfter.nonFiniteTriangleCount + ", components=" + savedAfter.connectedComponents + ", open=" + savedAfter.openEdges + ", nonManifold=" + savedAfter.nonManifoldEdges + ", windingInconsistent=" + savedAfter.windingInconsistentEdges + ")");
  }
  suppliedBody = { positions: positionsFromTriangles(repaired.triangles), watertight: inspectWatertight(repaired.triangles, 1), savedBefore, savedAfter };
}
const common = [state.mode, state.host, state.hostParams.k, state.skinParams.thickness, state.patches, state.skinParams.roundK, { resolution, targetLongestMm }, state.skinParams.coinBulge, state.skinParams.quadMeshJoinWidth, state.skinParams.coinBulgeBalance] as const;
stage("surface mesh");
const surface = await buildSkinMeshParallel({
  mode: state.mode,
  host: state.host,
  hostK: state.hostParams.k,
  thickness: state.skinParams.thickness,
  patches: state.patches,
  roundK: state.skinParams.roundK,
  options: { resolution, targetLongestMm },
  coinBulge: state.skinParams.coinBulge,
  quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
  coinBulgeBalance: state.skinParams.coinBulgeBalance,
  internalGraph: null,
}, requestedWorkers);
if (activePrintProfile && activePrintProfileSha256) {
  printPlan = resolveCliPrintPlan(activePrintProfile, activePrintProfileSha256, {
    recipeSha256, seed: state.hostParams.seed, currentInternalStructure: internalStructure,
    currentDryWebNormalizedRadius: state.skinParams.internalRadius, currentTargetLongestMm: targetLongestMm,
    currentSurfaceResolution: resolution, currentFusedResolution: fusedResolution, currentAngleThresholdDeg: thresholdDeg,
    scaleMmPerUnit: surface.scaleMmPerUnit,
  });
}
const meshStep = computeSkinSamplingBounds(state.host, state.hostParams.k, state.skinParams.thickness, state.patches).longest / resolution;
const surfacePositions = new Float32Array(surface.triangles.flatMap((triangle) => [
  triangle.a.x, triangle.a.y, triangle.a.z, triangle.b.x, triangle.b.y, triangle.b.z, triangle.c.x, triangle.c.y, triangle.c.z,
]));
const surfacePositionsMm = new Float32Array(surfacePositions.map((value) => value * surface.scaleMmPerUnit));
const explicitScaffoldTargets = printPlan
  ? printPlan.explicitScaffoldTargets
  : sliceFeedbackReportPath && sliceFeedbackStlPath
    ? await loadSliceFeedbackTargets(sliceFeedbackReportPath, sliceFeedbackStlPath, surfacePositionsMm)
    : [];
const scaffoldOptions = printPlan
  ? printPlan.scaffoldOptions
  : { ...DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS, baseRadiusMm: scaffoldBaseRadiusMm };
stage("reachability policy");
const initialDiagnosis = diagnoseSurfaceAnglePositions(surfacePositions, null, thresholdDeg, meshStep);
// The policy index is expressed in millimetres. Keep the diagnosed faces in
// that same coordinate system; passing source units here collapses scaffold
// contacts toward the origin and can make the fused first layer miss its
// recorded plate anchors at low resolution.
const initialDangerPositionsMm = new Float32Array(
  initialDiagnosis.beforeDangerPositions.map((value) => value * surface.scaleMmPerUnit),
);
const assignments = assignOverhangSupportTargets({
  diagnosedFaces: initialDangerPositionsMm,
  explicitTargets: explicitScaffoldTargets,
  finalSurfacePositionsMm: surfacePositionsMm,
});
if (overhangDiagnosticPath) {
  let plateZMm = Infinity;
  for (let offset = 2; offset < surfacePositionsMm.length; offset += 3) plateZMm = Math.min(plateZMm, surfacePositionsMm[offset]);
  const dryWebConnectionCandidatesMm = state.patches.flatMap((patch) => patch.points
    .filter((point) => point.role !== "bridge" && point.role !== "surfaceConnector")
    .map((point) => ({
      xMm: point.x * surface.scaleMmPerUnit,
      yMm: point.y * surface.scaleMmPerUnit,
      zMm: point.z * surface.scaleMmPerUnit,
    })));
  const diagnostic = buildOverhangSupportDiagnostic({
    ledger: assignments,
    finalSurfacePositionsMm: surfacePositionsMm,
    dryWebConnectionCandidatesMm,
    plateZMm,
  });
  await mkdir(dirname(overhangDiagnosticPath), { recursive: true });
  await writeFile(overhangDiagnosticPath, JSON.stringify(diagnostic, null, 2) + "\n", "utf8");
  stage(`overhang diagnostic unresolved=${diagnostic.summary.unresolvedTotal} base=${diagnostic.summary.baseClassificationUnresolved} inside-no-dry-web=${diagnostic.summary.insideDryWebDestinationMissing} outside-no-scaffold=${diagnostic.summary.outsideScaffoldDestinationMissing} other=${diagnostic.summary.other}`);
  if (diagnosticOnly) {
    // Deliberately stop before Dry Web, BODY, scaffold, fusion, or archive work.
    // This is a fail-closed observation path, not an export bypass.
    throw new Error(`Diagnostic-only stop: unresolved overhang targets (${diagnostic.summary.unresolvedTotal})`);
  }
}
if (printPlan) assertResolvedPrintPlanSupportCounts(printPlan, assignments.counts);
else validateOverhangAssignmentLedger(assignments);
stage(`classification policy=${assignments.policy} total=${assignments.counts.total} inside=${assignments.counts.inside} outside=${assignments.counts.outside} unresolved=${assignments.counts.unresolved}`);
stage("internal graph");
let graph;
if (internalStructure === "targetedGrid") {
  const targets = assignments.insideTargets.map((target) => ({
    ...target,
    position: {
      x: target.position.x / surface.scaleMmPerUnit,
      y: target.position.y / surface.scaleMmPerUnit,
      z: target.position.z / surface.scaleMmPerUnit,
    },
    normal: target.normal,
  }));
  graph = buildTargetedGridInternalStructure(state.host, state.hostParams.k, state.patches, targets, state.skinParams.internalDensity, state.skinParams.internalRadius);
} else {
  graph = buildVoronoiInternalStructure(state.host, state.hostParams.k, state.skinParams.internalDensity, state.skinParams.internalRadius, state.skinParams.internalRandomness, state.skinParams.seed);
}
if (assignments.counts.inside > 0 && !graph.edges.length) throw new Error("Fail closed: inside overhang assignments produced an empty Dry Web graph");
if (bodyProvenance) validateBodyProvenanceGraph(bodyProvenance, graph);
stage("BODY reuse/build");
let bodyPositions: Float32Array;
let bodyTopology: { watertight: ReturnType<typeof inspectWatertight>; connectedComponents: number; removedSavedDegenerateTriangleCount: number; scaleMmPerUnit: number };
if (suppliedBody) {
  bodyPositions = suppliedBody.positions;
  bodyTopology = {
    watertight: suppliedBody.watertight,
    connectedComponents: suppliedBody.savedAfter.connectedComponents,
    removedSavedDegenerateTriangleCount: suppliedBody.savedAfter.degenerateTriangleCount,
    scaleMmPerUnit: surface.scaleMmPerUnit,
  };
} else {
  const body = await buildSkinMeshParallel({
    mode: state.mode,
    host: state.host,
    hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches,
    roundK: state.skinParams.roundK,
    options: { resolution, targetLongestMm },
    coinBulge: state.skinParams.coinBulge,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    internalGraph: graph,
  }, requestedWorkers);
  const savedBefore = inspectSavedStlTopology(body.triangles, body.scaleMmPerUnit);
  if (savedBefore.nonFiniteTriangleCount > 0 || !savedBefore.closed || !savedBefore.degenerateFree || savedBefore.connectedComponents !== 1) {
    throw new Error("Fail closed: built BODY STL rejected before winding repair (closed=" + savedBefore.closed + ", degenerate=" + savedBefore.degenerateTriangleCount + ", nonFinite=" + savedBefore.nonFiniteTriangleCount + ", components=" + savedBefore.connectedComponents + ", open=" + savedBefore.openEdges + ", nonManifold=" + savedBefore.nonManifoldEdges + ", windingInconsistent=" + savedBefore.windingInconsistentEdges + ")");
  }
  const repaired = orientMeshForSavedStl(body);
  const savedAfter = inspectSavedStlTopology(repaired.triangles, repaired.scaleMmPerUnit);
  if (!savedAfter.ok || savedAfter.connectedComponents !== 1) {
    throw new Error("Fail closed: built BODY STL repair failed (closed=" + savedAfter.closed + ", winding=" + savedAfter.windingConsistent + ", degenerate=" + savedAfter.degenerateTriangleCount + ", nonFinite=" + savedAfter.nonFiniteTriangleCount + ", components=" + savedAfter.connectedComponents + ", open=" + savedAfter.openEdges + ", nonManifold=" + savedAfter.nonManifoldEdges + ", windingInconsistent=" + savedAfter.windingInconsistentEdges + ")");
  }
  builtBodyTopology = { savedBefore, savedAfter };
  bodyPositions = new Float32Array(repaired.triangles.flatMap((triangle) => [
    triangle.a.x * repaired.scaleMmPerUnit, triangle.a.y * repaired.scaleMmPerUnit, triangle.a.z * repaired.scaleMmPerUnit,
    triangle.b.x * repaired.scaleMmPerUnit, triangle.b.y * repaired.scaleMmPerUnit, triangle.b.z * repaired.scaleMmPerUnit,
    triangle.c.x * repaired.scaleMmPerUnit, triangle.c.y * repaired.scaleMmPerUnit, triangle.c.z * repaired.scaleMmPerUnit,
  ]));
  bodyTopology = {
    watertight: inspectWatertight(repaired.triangles, repaired.scaleMmPerUnit),
    connectedComponents: savedAfter.connectedComponents,
    removedSavedDegenerateTriangleCount: repaired.removedSavedDegenerateTriangleCount ?? savedAfter.degenerateTriangleCount,
    scaleMmPerUnit: repaired.scaleMmPerUnit,
  };
}
const surfaceSdf = createCompositeSdfEvaluator(state.mode, state.host, state.hostParams.k, state.skinParams.thickness, state.patches, state.skinParams.roundK, state.skinParams.coinBulge, state.skinParams.coinBulgeBalance);
stage("gate");
const gate = graph.edges.length
  ? evaluateInternalPrintGate({ graph, mesh: bodyTopology, resolution, targetLongestMm, surfaceSdf: (point) => surfaceSdf(point.x, point.y, point.z) })
  : { ok: true, reasons: [] as string[] };
if (!gate.ok) throw new Error(`Fail closed: Internal A1 mini gate NG: ${gate.reasons.join(" / ")}`);
stage("diagnosis");
const diagnosis = diagnoseSurfaceAnglePositions(surfacePositions, graph, thresholdDeg, meshStep);
const reachability = filterSupportEnforcerReachability(assignments.outsideFacePositionsMm, surfacePositionsMm);
if (assignments.outsideFacePositionsMm.length > 0 && !reachability.keptFaceCount) throw new Error(`Fail closed: no reachable scaffold faces (outside diagnosed=${assignments.outsideFacePositionsMm.length / 9}, rejected=${reachability.rejectedFaceCount})`);
if (explicitScaffoldTargets.length) stage("explicit scaffold targets " + explicitScaffoldTargets.length);
stage("external scaffold");
const scaffold = buildExternalPerimeterScaffold(
  reachability.keptPositions,
  surfacePositionsMm,
  bodyPositions,
  scaffoldOptions,
  assignments.outsideExplicitTargetsMm,
  !printPlan || printPlan.baseInteriorPolicy === "exclude-host-interior-v1" ? {
    host: state.host,
    hostK: state.hostParams.k,
    scaleMmPerUnit: surface.scaleMmPerUnit,
    rejectEmbeddedExplicitTargets: true,
  } : undefined,
);
if (assignments.counts.outside > 0 && (!scaffold.stats.pillarCount || !scaffold.positions.length)) {
  throw new Error("Fail closed: no external scaffold pillars (coverage=" + scaffold.stats.coverageFaceCount + ", collisionRejected=" + scaffold.stats.collisionRejectedFaceCount + ", shortRejected=" + scaffold.stats.shortRejectedFaceCount + ")");
}
if (planOnly) {
  console.log(JSON.stringify({ planOnly: true, workers: requestedWorkers, supportPolicy: assignments.policy, classificationCounts: assignments.counts, graph: { nodes: graph.nodes.length, edges: graph.edges.length }, reachability: { candidate: reachability.candidateFaceCount, kept: reachability.keptFaceCount, rejected: reachability.rejectedFaceCount }, scaffold: scaffold.stats }));
  process.exit(0);
}
stage("fused scaffold mesh");
const mmToSource = 1 / surface.scaleMmPerUnit;
const sourcePillars: SkinScaffoldPillar[] = scaffold.pillars.map((pillar) => {
  const localRadiusMm = printPlan ? scaffoldOptions.shaftRadiusMm : 0.65;
  const local = !pillar.plateAnchored;
  return {
    x: pillar.xMm * mmToSource, y: pillar.yMm * mmToSource,
    plateZ: pillar.plateZMm * mmToSource, topZ: pillar.topZMm * mmToSource,
    shaftRadius: (local ? localRadiusMm : scaffoldOptions.shaftRadiusMm) * mmToSource,
    baseRadius: (local ? localRadiusMm : scaffoldOptions.baseRadiusMm) * mmToSource,
    tipRadius: (local ? localRadiusMm : pillar.contactRadiusMm) * mmToSource,
    baseHeight: (local ? localRadiusMm : scaffoldOptions.baseHeightMm) * mmToSource,
    tipHeight: (local ? localRadiusMm : scaffoldOptions.tipHeightMm) * mmToSource,
  };
});
const fused = await buildSkinMeshParallel({
  mode: state.mode,
  host: state.host,
  hostK: state.hostParams.k,
  thickness: state.skinParams.thickness,
  patches: state.patches,
  roundK: state.skinParams.roundK,
  options: { resolution: fusedResolution, targetLongestMm },
  coinBulge: state.skinParams.coinBulge,
  quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
  coinBulgeBalance: state.skinParams.coinBulgeBalance,
  internalGraph: graph,
  scaffoldPillars: sourcePillars,
}, requestedWorkers);
let fusedForSave = fused;
let removedTinyFragmentTriangleCount = 0;
let fusedBefore = inspectSavedStlTopology(fusedForSave.triangles, fusedForSave.scaleMmPerUnit);
if (fusedBefore.connectedComponents > 1 && fusedBefore.closed && fusedBefore.degenerateFree && fusedBefore.nonFiniteTriangleCount === 0) {
  const summaries = summarizeSavedStlComponents(fusedForSave.triangles, fusedForSave.scaleMmPerUnit);
  const detachedFragments = summaries.slice(1);
  const expectedRemoved = detachedFragments.reduce((sum, component) => sum + component.triangleCount, 0);
  const totalTriangles = summaries.reduce((sum, component) => sum + component.triangleCount, 0);
  const largest = summaries[0];
  const detachedShare = expectedRemoved / totalTriangles;
  const maximumScaffoldCrossSectionMm = scaffoldBaseRadiusMm * 4;
  const detachedComponentsAreScaffoldLike = detachedFragments.every((component) =>
    Math.min(component.boundsMm.size.x, component.boundsMm.size.y) <= maximumScaffoldCrossSectionMm
  );
  const removable = detachedFragments.length > 0
    && largest.boundsMm.longest >= targetLongestMm * 0.95
    && detachedShare <= 0.02
    && detachedComponentsAreScaffoldLike;
  if (removable) {
    const cleaned = keepLargestSavedTriangleComponent(fusedForSave.triangles, fusedForSave.scaleMmPerUnit);
    if (cleaned.removedTriangleCount !== expectedRemoved) throw new Error("Fail closed: detached fragment cleanup count mismatch");
    removedTinyFragmentTriangleCount = cleaned.removedTriangleCount;
    fusedForSave = {
      ...fusedForSave,
      triangles: cleaned.triangles,
      connectedComponents: countConnectedComponents(cleaned.triangles),
      watertight: inspectWatertight(cleaned.triangles, fusedForSave.scaleMmPerUnit),
    };
    fusedBefore = inspectSavedStlTopology(fusedForSave.triangles, fusedForSave.scaleMmPerUnit);
    console.error("removed detached fused-mesh fragment triangles: " + removedTinyFragmentTriangleCount);
  }
}
if (!fusedBefore.closed || !fusedBefore.degenerateFree || fusedBefore.nonFiniteTriangleCount > 0 || fusedBefore.connectedComponents !== 1) {
  const componentDetail = summarizeSavedStlComponents(fusedForSave.triangles, fusedForSave.scaleMmPerUnit)
    .slice(0, 6)
    .map((component, index) => "#" + (index + 1) + " " + component.triangleCount + " faces / " + component.boundsMm.size.x.toFixed(1) + "x" + component.boundsMm.size.y.toFixed(1) + "x" + component.boundsMm.size.z.toFixed(1) + " mm / z " + component.boundsMm.min.z.toFixed(1) + ".." + component.boundsMm.max.z.toFixed(1))
    .join(" | ");
  throw new Error("Fail closed: fused BODY topology NG before repair (closed=" + fusedBefore.closed + ", components=" + fusedBefore.connectedComponents + ", degenerate=" + fusedBefore.degenerateTriangleCount + ", open=" + fusedBefore.openEdges + ", nonManifold=" + fusedBefore.nonManifoldEdges + "; detail=" + componentDetail + ")");
}
const fusedRepaired = orientMeshForSavedStl(fusedForSave);
const plateNormalization = normalizeFusedScaffoldPlatePlane(fusedRepaired, sourcePillars);
const fusedAfter = inspectSavedStlTopology(fusedRepaired.triangles, fusedRepaired.scaleMmPerUnit);
if (!fusedAfter.ok || fusedAfter.connectedComponents !== 1) {
  throw new Error("Fail closed: fused BODY topology NG after repair (closed=" + fusedAfter.closed + ", winding=" + fusedAfter.windingConsistent + ", components=" + fusedAfter.connectedComponents + ", degenerate=" + fusedAfter.degenerateTriangleCount + ")");
}
const plateSourcePillars = sourcePillars.filter((_, index) => scaffold.pillars[index].plateAnchored);
const plateAnchor = inspectFusedScaffoldPlateAnchoring(fusedRepaired, plateSourcePillars, 0.2);
if (assignments.counts.outside > 0 && !plateAnchor.ok) {
  throw new Error("Fail closed: fused scaffold does not start on layer 1 (clearance=" + plateAnchor.plateClearanceMm.toFixed(3) + " mm, spread=" + plateAnchor.plateSpreadMm.toFixed(3) + " mm)");
}
const fusedPositionsMm = positionsFromTriangles(fusedRepaired.triangles).map((value) => value * fusedRepaired.scaleMmPerUnit);
const geometryFingerprint = printPlan ? await geometryFingerprintLowResolution(fusedPositionsMm) : null;
stage("package");
const result = await buildBambu3mf([
  { name: "BODY_WITH_FUSED_SCAFFOLD", role: "body", positions: fusedPositionsMm },
], { title: basename(outputPath, ".3mf"), supportType, generatorVersion: printPlan?.profile.appVersion ?? "0.69.0" });
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(outputPath, new Uint8Array(result.archive));
const validationFacts = printPlan && geometryFingerprint ? buildPrintValidationFacts(printPlan, {
  bboxMm: bboxFromPositionsMm(fusedPositionsMm), faceCount: fusedPositionsMm.length / 9, vertexCount: result.stats.bodyVertices,
  connectedComponents: fusedAfter.connectedComponents, watertight: fusedAfter.closed, degenerateTriangleCount: fusedAfter.degenerateTriangleCount,
  internalGraphNodes: graph.nodes.length, internalGraphEdges: graph.edges.length, scaffoldPillarCount: scaffold.stats.pillarCount,
  plateAnchorOk: assignments.counts.outside === 0 || plateAnchor.ok, plateSpreadMm: plateAnchor.plateSpreadMm, fingerprint: geometryFingerprint,
  supportPolicy: assignments.policy, classificationCounts: assignments.counts,
}) : null;
const validationOutputPath = validationPath ?? (validationFacts ? (outputPath.endsWith(".3mf") ? outputPath.slice(0, -4) : outputPath) + ".validation.json" : undefined);
if (validationFacts && validationOutputPath) {
  await mkdir(dirname(resolve(validationOutputPath)), { recursive: true });
  await writeFile(validationOutputPath, JSON.stringify(validationFacts, null, 2) + "\n", "utf8");
}
console.log(JSON.stringify({ output: resolve(outputPath), resolution, fusedResolution, workers: requestedWorkers, targetLongestMm, thresholdDeg, supportType, scaffoldBaseRadiusMm, supportPolicy: assignments.policy, classificationCounts: assignments.counts, graph: { nodes: graph.nodes.length, edges: graph.edges.length }, gate: { ok: gate.ok, reasons: gate.reasons }, bodyReuse: suppliedBody ? { inputWindingInconsistentEdges: suppliedBody.savedBefore.windingInconsistentEdges, repairedWindingInconsistentEdges: suppliedBody.savedAfter.windingInconsistentEdges } : null, bodySavedTopology: suppliedBody ? { source: "supplied", inputWindingInconsistentEdges: suppliedBody.savedBefore.windingInconsistentEdges, repairedWindingInconsistentEdges: suppliedBody.savedAfter.windingInconsistentEdges } : builtBodyTopology ? { source: "built", inputWindingInconsistentEdges: builtBodyTopology.savedBefore.windingInconsistentEdges, repairedWindingInconsistentEdges: builtBodyTopology.savedAfter.windingInconsistentEdges } : null, reachability: { candidate: reachability.candidateFaceCount, kept: reachability.keptFaceCount, rejected: reachability.rejectedFaceCount, invalid: reachability.invalidCandidateFaceCount }, scaffold: scaffold.stats, plateNormalization, plateAnchor, removedTinyFragmentTriangleCount, stats: result.stats, archiveBytes: result.stats.archiveBytes, printProfile: printPlan ? { sha256: printPlan.profileSha256, schema: printPlan.profile.schema } : null, validationOutput: validationOutputPath ?? null, validationFacts }));
