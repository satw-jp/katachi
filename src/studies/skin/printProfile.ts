import { sha256Hex } from "../../lib/hash.ts";
import type { ExternalScaffoldOptions, ExternalScaffoldTarget } from "./externalScaffold.ts";
import { OVERHANG_SUPPORT_POLICY, type OverhangAssignmentCounts } from "./overhangSupportPolicy.ts";

export const SKIN_PRINT_PROFILE_SCHEMA = "katachi.skin.print-profile.v1" as const;
export const PRINT_VALIDATION_FACTS_SCHEMA = "katachi.skin.print-validation-facts.v1" as const;
export const LOW_RESOLUTION_FINGERPRINT_FACE_LIMIT = 200_000;
export type PrintSupportClassificationCounts = OverhangAssignmentCounts;

export interface SkinPrintProfileV1 {
  schema: typeof SKIN_PRINT_PROFILE_SCHEMA;
  profileVersion: 1;
  profileName: string;
  appVersion: string;
  artifactVersion: string;
  /** Optional for old v1 Profiles; required for new v088 Profiles. */
  supportPolicy?: typeof OVERHANG_SUPPORT_POLICY;
  /** Optional for old v1 Profiles; required for new v088 Profiles. */
  expectedClassificationCounts?: PrintSupportClassificationCounts;
  generatorCommit: string;
  generatorTag: string | null;
  shapeRecipe: {
    sha256: string;
    seed: string;
    pathHint?: string;
  };
  geometry: {
    targetLongestMm: number;
    surfaceResolution: number;
    fusedResolution: number;
    angleThresholdDeg: number;
  };
  internalStructure: {
    method: "targetedGrid";
    dryWebNormalizedRadius: number;
    dryWebPhysicalRadiusMm: number;
    dryWebPhysicalDiameterMm: number;
  };
  scaffold: {
    coverageMode: ExternalScaffoldOptions["coverageMode"];
    perimeterBandMm: number;
    spacingMm: number;
    shaftRadiusMm: number;
    shaftDiameterMm: number;
    footRadiusMm: number;
    footDiameterMm: number;
    contactRadiusMm: number;
    contactDiameterMm: number;
    contactOverlapMm: number;
    plateAnchorDropMm: number;
    baseHeightMm: number;
    tipHeightMm: number;
    xyClearanceMm: number;
    sides: number;
    baseInteriorPolicy: "exclude-host-interior-v1" | "legacy-include-host-interior";
    explicitTargets: ExternalScaffoldTarget[];
  };
  printer: {
    printer: string;
    nozzleMm: number;
    material: string;
    layerHeightMm: number;
    automaticSupport: false;
    supportType: "normal(manual)";
  };
  slicer: {
    application: string;
    version: string;
    printerPresetId: string;
    filamentPresetId: string;
    processPresetId: string;
  };
  executionHints: {
    workerCount: number;
  };
}

export interface PrintRecipeBinding {
  recipeSha256: string | null;
  seed: string;
  currentInternalStructure: string;
  currentDryWebNormalizedRadius: number;
  currentTargetLongestMm?: number;
  currentSurfaceResolution?: number;
  currentFusedResolution?: number;
  currentAngleThresholdDeg?: number;
  scaleMmPerUnit?: number;
  currentSupportClassificationCounts?: PrintSupportClassificationCounts;
}

export interface ResolvedPrintPlan {
  schema: "katachi.skin.resolved-print-plan.v1";
  profile: SkinPrintProfileV1;
  profileSha256: string;
  recipeSha256: string;
  seed: string;
  surfaceResolution: number;
  fusedResolution: number;
  targetLongestMm: number;
  angleThresholdDeg: number;
  dryWebNormalizedRadius: number;
  dryWebPhysicalRadiusMm: number;
  dryWebPhysicalDiameterMm: number;
  scaffoldOptions: ExternalScaffoldOptions;
  explicitScaffoldTargets: ExternalScaffoldTarget[];
  baseInteriorPolicy: SkinPrintProfileV1["scaffold"]["baseInteriorPolicy"];
  printer: SkinPrintProfileV1["printer"];
  slicer: SkinPrintProfileV1["slicer"];
  executionHints: SkinPrintProfileV1["executionHints"];
  supportPolicy: typeof OVERHANG_SUPPORT_POLICY;
  expectedClassificationCounts?: PrintSupportClassificationCounts;
}

export interface PrintProfileMatch {
  matches: boolean;
  reasons: string[];
}

export interface GeometryFingerprintResult {
  sha256: string | null;
  status: "computed-low-resolution" | "deferred-high-resolution";
  faceCount: number;
  limitFaces: number;
}

export interface PrintValidationFactsV1 {
  schema: typeof PRINT_VALIDATION_FACTS_SCHEMA;
  printApproval: false;
  profile: {
    name: string;
    version: 1;
    sha256: string;
    appVersion: string;
    artifactVersion: string;
    generatorCommit: string;
    generatorTag: string | null;
  };
  shapeRecipe: { sha256: string; seed: string };
  geometry: {
    targetLongestMm: number;
    surfaceResolution: number;
    fusedResolution: number;
    angleThresholdDeg: number;
    bboxMm: { width: number; depth: number; height: number };
    faceCount: number;
    vertexCount: number;
    connectedComponents: number;
    watertight: boolean;
    degenerateTriangleCount: number;
    geometryFingerprintSha256: string | null;
    geometryFingerprintStatus: GeometryFingerprintResult["status"];
  };
  internalStructure: {
    method: "targetedGrid";
    nodeCount: number;
    edgeCount: number;
    dryWebNormalizedRadius: number;
    dryWebPhysicalRadiusMm: number;
    dryWebPhysicalDiameterMm: number;
  };
  scaffold: {
    pillarCount: number;
    shaftRadiusMm: number;
    shaftDiameterMm: number;
    footRadiusMm: number;
    footDiameterMm: number;
    contactRadiusMm: number;
    contactDiameterMm: number;
    contactOverlapMm: number;
    spacingMm: number;
    plateAnchorDropMm: number;
    plateAnchorOk: boolean;
    plateSpreadMm: number;
  };
  printer: SkinPrintProfileV1["printer"];
  slicer: SkinPrintProfileV1["slicer"];
  executionHints: SkinPrintProfileV1["executionHints"];
  supportPolicy: typeof OVERHANG_SUPPORT_POLICY;
  classificationCounts: PrintSupportClassificationCounts;
}

export interface PrintValidationFactsInput {
  bboxMm: { width: number; depth: number; height: number };
  faceCount: number;
  vertexCount: number;
  connectedComponents: number;
  watertight: boolean;
  degenerateTriangleCount: number;
  internalGraphNodes: number;
  internalGraphEdges: number;
  scaffoldPillarCount: number;
  plateAnchorOk: boolean;
  plateSpreadMm: number;
  fingerprint: GeometryFingerprintResult;
  supportPolicy?: typeof OVERHANG_SUPPORT_POLICY;
  classificationCounts?: PrintSupportClassificationCounts;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const finitePositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const finiteNonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const close = (a: number, b: number, tolerance = 1e-6): boolean => Math.abs(a - b) <= tolerance;

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requirePositive(value: unknown, label: string): number {
  if (!finitePositive(value)) throw new Error(`${label} must be a finite positive number`);
  return value;
}

function requireNonNegative(value: unknown, label: string): number {
  if (!finiteNonNegative(value)) throw new Error(`${label} must be a finite non-negative number`);
  return value;
}

function validateTargets(value: unknown): ExternalScaffoldTarget[] {
  if (!Array.isArray(value)) throw new Error("scaffold.explicitTargets must be an array");
  return value.map((target, index) => {
    const item = requireObject(target, `scaffold.explicitTargets[${index}]`);
    const xMm = Number(item.xMm); const yMm = Number(item.yMm); const zMm = Number(item.zMm);
    if (![xMm, yMm, zMm].every(Number.isFinite)) throw new Error(`scaffold.explicitTargets[${index}] has invalid coordinates`);
    const result: ExternalScaffoldTarget = { xMm, yMm, zMm };
    if (item.contactRadiusMm !== undefined) result.contactRadiusMm = requirePositive(item.contactRadiusMm, `scaffold.explicitTargets[${index}].contactRadiusMm`);
    if (item.contactOverlapMm !== undefined) result.contactOverlapMm = requireNonNegative(item.contactOverlapMm, `scaffold.explicitTargets[${index}].contactOverlapMm`);
    return result;
  });
}

function validateClassificationCounts(value: unknown, label: string): PrintSupportClassificationCounts {
  const item = requireObject(value, label);
  const keys = ["total", "inside", "outside", "unresolved", "duplicate", "unassigned"] as const;
  const counts = Object.fromEntries(keys.map((key) => {
    const raw = item[key];
    if (!Number.isInteger(raw) || Number(raw) < 0) throw new Error(`${label}.${key} must be a non-negative integer`);
    return [key, Number(raw)];
  })) as unknown as PrintSupportClassificationCounts;
  if (counts.total !== counts.inside + counts.outside + counts.unresolved) throw new Error(`${label} is not a complete partition`);
  return counts;
}

function sameClassificationCounts(a: PrintSupportClassificationCounts, b: PrintSupportClassificationCounts): boolean {
  return a.total === b.total && a.inside === b.inside && a.outside === b.outside &&
    a.unresolved === b.unresolved && a.duplicate === b.duplicate && a.unassigned === b.unassigned;
}

export function validateSkinPrintProfile(value: unknown): SkinPrintProfileV1 {
  const root = requireObject(value, "Print Profile");
  if (root.schema !== SKIN_PRINT_PROFILE_SCHEMA || root.profileVersion !== 1) throw new Error(`Unsupported Print Profile schema: ${String(root.schema)}`);
  const shapeRecipe = requireObject(root.shapeRecipe, "shapeRecipe");
  const geometry = requireObject(root.geometry, "geometry");
  const internal = requireObject(root.internalStructure, "internalStructure");
  const scaffold = requireObject(root.scaffold, "scaffold");
  const printer = requireObject(root.printer, "printer");
  const slicer = requireObject(root.slicer, "slicer");
  const hints = requireObject(root.executionHints, "executionHints");
  const artifactVersion = requireString(root.artifactVersion, "artifactVersion");
  let supportPolicy: typeof OVERHANG_SUPPORT_POLICY | undefined;
  let expectedClassificationCounts: PrintSupportClassificationCounts | undefined;
  if (root.supportPolicy !== undefined || root.expectedClassificationCounts !== undefined) {
    if (root.supportPolicy !== OVERHANG_SUPPORT_POLICY) throw new Error("supportPolicy is invalid");
    if (root.expectedClassificationCounts === undefined) throw new Error("expectedClassificationCounts is required with supportPolicy");
    supportPolicy = OVERHANG_SUPPORT_POLICY;
    expectedClassificationCounts = validateClassificationCounts(root.expectedClassificationCounts, "expectedClassificationCounts");
  }
  if (artifactVersion.includes("v088") && (!supportPolicy || !expectedClassificationCounts)) {
    throw new Error("v088 Print Profile requires supportPolicy and expectedClassificationCounts");
  }
  const recipeSha256 = requireString(shapeRecipe.sha256, "shapeRecipe.sha256").toLowerCase();
  if (!SHA256_PATTERN.test(recipeSha256)) throw new Error("shapeRecipe.sha256 must be lowercase SHA-256 hex");
  if (internal.method !== "targetedGrid") throw new Error("internalStructure.method must be targetedGrid");
  if (printer.automaticSupport !== false || printer.supportType !== "normal(manual)") throw new Error("SKIN Print Profile requires automaticSupport=false and supportType=normal(manual)");
  const coverageMode = scaffold.coverageMode;
  if (coverageMode !== "allReachable" && coverageMode !== "outerBand") throw new Error("scaffold.coverageMode is invalid");
  const baseInteriorPolicy = scaffold.baseInteriorPolicy;
  if (baseInteriorPolicy !== "exclude-host-interior-v1" && baseInteriorPolicy !== "legacy-include-host-interior") throw new Error("scaffold.baseInteriorPolicy is invalid");
  const shaftRadiusMm = requirePositive(scaffold.shaftRadiusMm, "scaffold.shaftRadiusMm");
  const shaftDiameterMm = requirePositive(scaffold.shaftDiameterMm, "scaffold.shaftDiameterMm");
  const footRadiusMm = requirePositive(scaffold.footRadiusMm, "scaffold.footRadiusMm");
  const footDiameterMm = requirePositive(scaffold.footDiameterMm, "scaffold.footDiameterMm");
  const contactRadiusMm = requirePositive(scaffold.contactRadiusMm, "scaffold.contactRadiusMm");
  const contactDiameterMm = requirePositive(scaffold.contactDiameterMm, "scaffold.contactDiameterMm");
  const dryWebPhysicalRadiusMm = requirePositive(internal.dryWebPhysicalRadiusMm, "internalStructure.dryWebPhysicalRadiusMm");
  const dryWebPhysicalDiameterMm = requirePositive(internal.dryWebPhysicalDiameterMm, "internalStructure.dryWebPhysicalDiameterMm");
  if (!close(shaftDiameterMm, shaftRadiusMm * 2) || !close(footDiameterMm, footRadiusMm * 2) || !close(contactDiameterMm, contactRadiusMm * 2)) throw new Error("scaffold radius/diameter values are inconsistent");
  if (!close(dryWebPhysicalDiameterMm, dryWebPhysicalRadiusMm * 2)) throw new Error("Dry Web physical radius/diameter values are inconsistent");
  const surfaceResolution = Math.round(requirePositive(geometry.surfaceResolution, "geometry.surfaceResolution"));
  const fusedResolution = Math.round(requirePositive(geometry.fusedResolution, "geometry.fusedResolution"));
  if (surfaceResolution < 16 || fusedResolution < surfaceResolution) throw new Error("geometry resolutions are invalid");
  const workerCount = Math.round(requirePositive(hints.workerCount, "executionHints.workerCount"));
  return {
    schema: SKIN_PRINT_PROFILE_SCHEMA,
    profileVersion: 1,
    profileName: requireString(root.profileName, "profileName"),
    appVersion: requireString(root.appVersion, "appVersion"),
    artifactVersion,
    ...(supportPolicy ? { supportPolicy } : {}),
    ...(expectedClassificationCounts ? { expectedClassificationCounts } : {}),
    generatorCommit: requireString(root.generatorCommit, "generatorCommit"),
    generatorTag: root.generatorTag === null ? null : requireString(root.generatorTag, "generatorTag"),
    shapeRecipe: { sha256: recipeSha256, seed: requireString(shapeRecipe.seed, "shapeRecipe.seed"), ...(shapeRecipe.pathHint === undefined ? {} : { pathHint: requireString(shapeRecipe.pathHint, "shapeRecipe.pathHint") }) },
    geometry: { targetLongestMm: requirePositive(geometry.targetLongestMm, "geometry.targetLongestMm"), surfaceResolution, fusedResolution, angleThresholdDeg: requirePositive(geometry.angleThresholdDeg, "geometry.angleThresholdDeg") },
    internalStructure: { method: "targetedGrid", dryWebNormalizedRadius: requirePositive(internal.dryWebNormalizedRadius, "internalStructure.dryWebNormalizedRadius"), dryWebPhysicalRadiusMm, dryWebPhysicalDiameterMm },
    scaffold: {
      coverageMode, perimeterBandMm: requireNonNegative(scaffold.perimeterBandMm, "scaffold.perimeterBandMm"), spacingMm: requirePositive(scaffold.spacingMm, "scaffold.spacingMm"),
      shaftRadiusMm, shaftDiameterMm, footRadiusMm, footDiameterMm, contactRadiusMm, contactDiameterMm,
      contactOverlapMm: requireNonNegative(scaffold.contactOverlapMm, "scaffold.contactOverlapMm"), plateAnchorDropMm: requireNonNegative(scaffold.plateAnchorDropMm, "scaffold.plateAnchorDropMm"),
      baseHeightMm: requirePositive(scaffold.baseHeightMm, "scaffold.baseHeightMm"), tipHeightMm: requirePositive(scaffold.tipHeightMm, "scaffold.tipHeightMm"), xyClearanceMm: requireNonNegative(scaffold.xyClearanceMm, "scaffold.xyClearanceMm"),
      sides: Math.round(requirePositive(scaffold.sides, "scaffold.sides")), baseInteriorPolicy, explicitTargets: validateTargets(scaffold.explicitTargets),
    },
    printer: { printer: requireString(printer.printer, "printer.printer"), nozzleMm: requirePositive(printer.nozzleMm, "printer.nozzleMm"), material: requireString(printer.material, "printer.material"), layerHeightMm: requirePositive(printer.layerHeightMm, "printer.layerHeightMm"), automaticSupport: false, supportType: "normal(manual)" },
    slicer: { application: requireString(slicer.application, "slicer.application"), version: requireString(slicer.version, "slicer.version"), printerPresetId: requireString(slicer.printerPresetId, "slicer.printerPresetId"), filamentPresetId: requireString(slicer.filamentPresetId, "slicer.filamentPresetId"), processPresetId: requireString(slicer.processPresetId, "slicer.processPresetId") },
    executionHints: { workerCount },
  };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalValue(child)]));
  }
  return value;
}

export function canonicalPrintProfileJson(profile: SkinPrintProfileV1): string {
  return JSON.stringify(canonicalValue(validateSkinPrintProfile(profile)));
}

export async function printProfileSha256(profile: SkinPrintProfileV1): Promise<string> {
  return sha256Hex(canonicalPrintProfileJson(profile));
}

export function matchPrintProfile(profile: SkinPrintProfileV1, binding: PrintRecipeBinding): PrintProfileMatch {
  const reasons: string[] = [];
  if (!binding.recipeSha256) reasons.push("Shape Recipeが読み込まれていません");
  else if (binding.recipeSha256 !== profile.shapeRecipe.sha256) reasons.push("Shape Recipe SHA-256がProfileと一致しません");
  if (binding.seed !== profile.shapeRecipe.seed) reasons.push(`Seedが不一致です（現在 ${binding.seed} / Profile ${profile.shapeRecipe.seed}）`);
  if (binding.currentInternalStructure !== profile.internalStructure.method) reasons.push("Internal Structure方式がProfileと一致しません");
  if (!close(binding.currentDryWebNormalizedRadius, profile.internalStructure.dryWebNormalizedRadius)) reasons.push("Dry Web正規化径がProfileと一致しません");
  if (binding.currentTargetLongestMm !== undefined && !close(binding.currentTargetLongestMm, profile.geometry.targetLongestMm)) reasons.push("最長辺mmがProfileと一致しません");
  if (binding.currentSurfaceResolution !== undefined && binding.currentSurfaceResolution !== profile.geometry.surfaceResolution) reasons.push("Surface解像度がProfileと一致しません");
  if (binding.currentFusedResolution !== undefined && binding.currentFusedResolution !== profile.geometry.fusedResolution) reasons.push("融合解像度がProfileと一致しません");
  if (binding.currentAngleThresholdDeg !== undefined && !close(binding.currentAngleThresholdDeg, profile.geometry.angleThresholdDeg)) reasons.push("角度閾値がProfileと一致しません");
  if (binding.scaleMmPerUnit !== undefined) {
    const actualRadiusMm = binding.currentDryWebNormalizedRadius * binding.scaleMmPerUnit;
    if (!close(actualRadiusMm, profile.internalStructure.dryWebPhysicalRadiusMm, 1e-5)) reasons.push("Dry Web実寸径がProfileと一致しません");
  }
  if (profile.expectedClassificationCounts && binding.currentSupportClassificationCounts &&
    !sameClassificationCounts(profile.expectedClassificationCounts, binding.currentSupportClassificationCounts)) {
    reasons.push("オーバーハング内外分類件数がProfileと一致しません");
  }
  return { matches: reasons.length === 0, reasons };
}

export function resolvePrintPlan(profileValue: SkinPrintProfileV1, profileSha256: string, binding: PrintRecipeBinding): ResolvedPrintPlan {
  const profile = validateSkinPrintProfile(profileValue);
  if (!SHA256_PATTERN.test(profileSha256)) throw new Error("Profile SHA-256 is invalid");
  const match = matchPrintProfile(profile, binding);
  if (!match.matches) throw new Error(`Print Profile mismatch: ${match.reasons.join(" / ")}`);
  const scaffold = profile.scaffold;
  return {
    schema: "katachi.skin.resolved-print-plan.v1", profile, profileSha256,
    recipeSha256: profile.shapeRecipe.sha256, seed: profile.shapeRecipe.seed,
    surfaceResolution: profile.geometry.surfaceResolution, fusedResolution: profile.geometry.fusedResolution,
    targetLongestMm: profile.geometry.targetLongestMm, angleThresholdDeg: profile.geometry.angleThresholdDeg,
    dryWebNormalizedRadius: profile.internalStructure.dryWebNormalizedRadius,
    dryWebPhysicalRadiusMm: profile.internalStructure.dryWebPhysicalRadiusMm,
    dryWebPhysicalDiameterMm: profile.internalStructure.dryWebPhysicalDiameterMm,
    scaffoldOptions: {
      coverageMode: scaffold.coverageMode, perimeterBandMm: scaffold.perimeterBandMm, spacingMm: scaffold.spacingMm,
      shaftRadiusMm: scaffold.shaftRadiusMm, baseRadiusMm: scaffold.footRadiusMm, tipRadiusMm: scaffold.contactRadiusMm,
      contactOverlapMm: scaffold.contactOverlapMm, plateAnchorDropMm: scaffold.plateAnchorDropMm,
      baseHeightMm: scaffold.baseHeightMm, tipHeightMm: scaffold.tipHeightMm, xyClearanceMm: scaffold.xyClearanceMm, sides: scaffold.sides,
    },
    explicitScaffoldTargets: scaffold.explicitTargets.map((target) => ({ ...target })),
    baseInteriorPolicy: scaffold.baseInteriorPolicy,
    printer: { ...profile.printer }, slicer: { ...profile.slicer }, executionHints: { ...profile.executionHints },
    supportPolicy: profile.supportPolicy ?? OVERHANG_SUPPORT_POLICY,
    ...(profile.expectedClassificationCounts ? { expectedClassificationCounts: { ...profile.expectedClassificationCounts } } : {}),
  };
}

export const resolveCliPrintPlan = resolvePrintPlan;
export const resolveWorkerPrintPlan = resolvePrintPlan;

/** Runtime gate used after exact diagnosis/classification, before geometry. */
export function assertResolvedPrintPlanSupportCounts(
  plan: ResolvedPrintPlan,
  counts: PrintSupportClassificationCounts,
): void {
  if (plan.supportPolicy !== OVERHANG_SUPPORT_POLICY) throw new Error("Fail closed: unsupported overhang support policy");
  if (counts.total !== counts.inside + counts.outside + counts.unresolved) throw new Error("Fail closed: overhang counts are not a complete partition");
  if (counts.duplicate !== 0) throw new Error(`Fail closed: duplicate overhang assignments (${counts.duplicate})`);
  if (counts.unassigned !== 0) throw new Error(`Fail closed: unassigned overhang targets (${counts.unassigned})`);
  if (counts.unresolved !== 0) throw new Error(`Fail closed: unresolved overhang targets (${counts.unresolved})`);
  if (plan.expectedClassificationCounts && !sameClassificationCounts(plan.expectedClassificationCounts, counts)) {
    throw new Error("Fail closed: runtime overhang classification counts do not match Print Profile");
  }
}

function normalFloat32(value: number): number {
  const rounded = Math.fround(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function geometryFingerprintLowResolution(positionsMm: Float32Array, limitFaces = LOW_RESOLUTION_FINGERPRINT_FACE_LIMIT): Promise<GeometryFingerprintResult> {
  if (positionsMm.length === 0 || positionsMm.length % 9 !== 0) throw new Error("geometry fingerprint requires a non-empty triangle soup");
  const faceCount = positionsMm.length / 9;
  if (faceCount > limitFaces) return { sha256: null, status: "deferred-high-resolution", faceCount, limitFaces };
  const records: string[] = new Array(faceCount);
  for (let face = 0; face < faceCount; face++) {
    const offset = face * 9;
    const vertices = [0, 3, 6].map((vertexOffset) => {
      const values = [positionsMm[offset + vertexOffset], positionsMm[offset + vertexOffset + 1], positionsMm[offset + vertexOffset + 2]];
      if (!values.every(Number.isFinite)) throw new Error("geometry fingerprint received non-finite coordinates");
      return values.map(normalFloat32).map((value) => value.toString()).join(",");
    }).sort();
    records[face] = vertices.join("|");
  }
  records.sort();
  const sha256 = await sha256Hex(`katachi.skin.geometry-fingerprint.low-res.v1\n${faceCount}\n${records.join("\n")}`);
  return { sha256, status: "computed-low-resolution", faceCount, limitFaces };
}

export function buildPrintValidationFacts(plan: ResolvedPrintPlan, input: PrintValidationFactsInput): PrintValidationFactsV1 {
  const p = plan.profile;
  const classificationCounts = input.classificationCounts ?? plan.expectedClassificationCounts ?? {
    total: 0, inside: 0, outside: 0, unresolved: 0, duplicate: 0, unassigned: 0,
  };
  return {
    schema: PRINT_VALIDATION_FACTS_SCHEMA, printApproval: false,
    profile: { name: p.profileName, version: 1, sha256: plan.profileSha256, appVersion: p.appVersion, artifactVersion: p.artifactVersion, generatorCommit: p.generatorCommit, generatorTag: p.generatorTag },
    shapeRecipe: { sha256: plan.recipeSha256, seed: plan.seed },
    geometry: { targetLongestMm: plan.targetLongestMm, surfaceResolution: plan.surfaceResolution, fusedResolution: plan.fusedResolution, angleThresholdDeg: plan.angleThresholdDeg,
      bboxMm: input.bboxMm, faceCount: input.faceCount, vertexCount: input.vertexCount, connectedComponents: input.connectedComponents, watertight: input.watertight,
      degenerateTriangleCount: input.degenerateTriangleCount, geometryFingerprintSha256: input.fingerprint.sha256, geometryFingerprintStatus: input.fingerprint.status },
    internalStructure: { method: "targetedGrid", nodeCount: input.internalGraphNodes, edgeCount: input.internalGraphEdges, dryWebNormalizedRadius: plan.dryWebNormalizedRadius, dryWebPhysicalRadiusMm: plan.dryWebPhysicalRadiusMm, dryWebPhysicalDiameterMm: plan.dryWebPhysicalDiameterMm },
    scaffold: { pillarCount: input.scaffoldPillarCount, shaftRadiusMm: p.scaffold.shaftRadiusMm, shaftDiameterMm: p.scaffold.shaftDiameterMm, footRadiusMm: p.scaffold.footRadiusMm, footDiameterMm: p.scaffold.footDiameterMm,
      contactRadiusMm: p.scaffold.contactRadiusMm, contactDiameterMm: p.scaffold.contactDiameterMm, contactOverlapMm: p.scaffold.contactOverlapMm, spacingMm: p.scaffold.spacingMm,
      plateAnchorDropMm: p.scaffold.plateAnchorDropMm, plateAnchorOk: input.plateAnchorOk, plateSpreadMm: input.plateSpreadMm },
    printer: { ...plan.printer }, slicer: { ...plan.slicer }, executionHints: { ...plan.executionHints },
    supportPolicy: input.supportPolicy ?? plan.supportPolicy,
    classificationCounts: { ...classificationCounts },
  };
}

export function bboxFromPositionsMm(positions: Float32Array): { width: number; depth: number; height: number } {
  if (positions.length === 0 || positions.length % 3 !== 0) throw new Error("bbox requires positions");
  let minX = Infinity; let minY = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  return { width: maxX - minX, depth: maxY - minY, height: maxZ - minZ };
}
