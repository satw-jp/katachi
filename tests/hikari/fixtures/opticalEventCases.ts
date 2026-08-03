import type {
  DiagnosticTermination,
  ReceiverTerminalEvent,
  TransportDomain,
  ViewTerminalEvent,
} from "../../../src/studies/cloud-sculpt/opticalEvents.ts";
import type { Rgb, Vec3 } from "../../../src/studies/cloud-sculpt/opticalScene.ts";

export interface OpticalEventFixedCase {
  id: string;
  geometry: {
    hostCenter: Vec3;
    hostRadius: number;
    smoothness: number;
    inclusionCenter: Vec3;
    inclusionRadius: number;
  };
  physicalScale: { mmPerShapeUnit: number; source: "assumed" | "derived-from-mesh" | "author" };
  reference: {
    surfacePoint?: Vec3;
    rayOrigin?: Vec3;
    rayDirection?: Vec3;
    maxEvents?: number;
    intent?: "surface-reflection" | "centerline-transmission" | "critical-angle-tir" | "straight-boundary-limit" | "straight-inclusion-pass" | "normalized-out-of-domain" | "invalid-containment";
    pureField?: { width: number; height: number; minU: number; minV: number; sizeU: number; sizeV: number };
    receiverExpectation?: "out-of-domain";
  };
  material: {
    hostIor: number;
    hostAbsorptionPerMm: Rgb;
    inclusionIor: number;
    inclusionAbsorptionPerMm: Rgb;
  };
  camera: Vec3;
  light: {
    propagation: Vec3;
    radiance: Rgb;
    sampleWeight: number;
    sampleCount: number;
    seed: string;
  };
  receiver: {
    id: string;
    planePoint: Vec3;
    normal: Vec3;
    minU: number;
    maxU: number;
    minV: number;
    maxV: number;
  };
  inclusion: {
    enabled: boolean;
    id: string;
    validContainment: boolean;
  };
  expected: {
    domain: TransportDomain;
    terminalEvent?: ViewTerminalEvent | ReceiverTerminalEvent;
    diagnosticTermination?: DiagnosticTermination;
    internalBounceCount?: { minimum: number };
    hadInternalReflection?: boolean;
    pathLengthShapeUnits?: number;
    pathLengthMillimetres?: number;
    deliveredPositive?: boolean;
    escapedPositive?: boolean;
    closureStatus: "closed" | "open" | "not-computable";
    receiverFluxMustStaySeparate: boolean;
    coverageIsScalar: boolean;
  };
  tolerance: {
    contract: number;
    pointShapeUnits: number;
    pathShapeUnits: number;
    fluxRelative: number;
    throughput: number;
    coverage: number;
    supportIoU: number;
  };
}

const COMMON_GEOMETRY = {
  hostCenter: { x: 0, y: 0, z: 0 },
  hostRadius: 1,
  smoothness: 0,
  inclusionCenter: { x: 0, y: 0, z: 0 },
  inclusionRadius: 0.35,
} as const;
const COMMON_MATERIAL = {
  hostIor: 1.5,
  hostAbsorptionPerMm: { r: 0, g: 0, b: 0 },
  inclusionIor: 1.2,
  inclusionAbsorptionPerMm: { r: 0, g: 0, b: 0 },
} as const;
const COMMON_SCALE = { mmPerShapeUnit: 20, source: "assumed" } as const;
const COMMON_RECEIVER = {
  id: "test-floor",
  planePoint: { x: 0, y: -2.35, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  minU: -16,
  maxU: 16,
  minV: -16,
  maxV: 16,
} as const;
const COMMON_CENTERLINE_REFERENCE = {
  rayOrigin: { x: 0, y: 0, z: 3 },
  rayDirection: { x: 0, y: 0, z: -1 },
} as const;
const NORMALIZED_ESCAPED_DIRECTION = {
  x: 0.994987562112089,
  y: -0.0999987500234375,
  z: 0,
} as const;
const COMMON_TOLERANCE = {
  contract: 1e-12,
  pointShapeUnits: 2e-3,
  pathShapeUnits: 2e-3,
  fluxRelative: 0.01,
  throughput: 1e-5,
  coverage: 0.1,
  supportIoU: 0.9,
} as const;

export const R05_VIEW_SURFACE_REFLECTION = {
  id: "R05-view-surface-reflection",
  geometry: COMMON_GEOMETRY,
  physicalScale: COMMON_SCALE,
  reference: { surfacePoint: { x: 0, y: 0, z: 1 }, intent: "surface-reflection" },
  material: COMMON_MATERIAL,
  camera: { x: 0, y: 0, z: 4 },
  light: { propagation: { x: 0, y: 0, z: -1 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 1, seed: "R05-view-surface-reflection" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: false, id: "none", validContainment: true },
  expected: { domain: "view", terminalEvent: "surface-reflection", internalBounceCount: { minimum: 0 }, hadInternalReflection: false, closureStatus: "not-computable", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: COMMON_TOLERANCE,
} as const satisfies OpticalEventFixedCase;

export const R05_VIEW_SIMPLE_TRANSMISSION = {
  id: "R05-view-simple-transmission",
  geometry: COMMON_GEOMETRY,
  physicalScale: COMMON_SCALE,
  reference: { ...COMMON_CENTERLINE_REFERENCE, intent: "centerline-transmission" },
  material: COMMON_MATERIAL,
  camera: { x: 0, y: 0, z: -4 },
  light: { propagation: { x: 0, y: 0, z: -1 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 1, seed: "R05-view-simple-transmission" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: false, id: "none", validContainment: true },
  expected: { domain: "view", terminalEvent: "transmission", internalBounceCount: { minimum: 0 }, hadInternalReflection: false, pathLengthShapeUnits: 2, pathLengthMillimetres: 40, closureStatus: "not-computable", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: { ...COMMON_TOLERANCE, pointShapeUnits: 2e-3, pathShapeUnits: 2e-3 },
} as const satisfies OpticalEventFixedCase;

export const R05_PATH_INTERNAL_REFLECTION = {
  id: "R05-path-internal-reflection",
  geometry: COMMON_GEOMETRY,
  physicalScale: COMMON_SCALE,
  reference: { rayOrigin: { x: 0, y: 0, z: 0.8 }, rayDirection: { x: 1, y: 0, z: 0 }, intent: "critical-angle-tir" },
  material: COMMON_MATERIAL,
  camera: { x: 0, y: 0, z: 4 },
  light: { propagation: { x: 1, y: 0, z: 0 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 1, seed: "R05-path-internal-reflection" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: false, id: "none", validContainment: true },
  expected: { domain: "view", internalBounceCount: { minimum: 1 }, hadInternalReflection: true, closureStatus: "not-computable", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: COMMON_TOLERANCE,
} as const satisfies OpticalEventFixedCase;

export const R05_RECEIVER_FOCUS = {
  id: "R05-receiver-focus",
  geometry: COMMON_GEOMETRY,
  physicalScale: COMMON_SCALE,
  reference: { intent: "centerline-transmission" },
  material: COMMON_MATERIAL,
  camera: { x: 4, y: 2.5, z: 5 },
  light: { propagation: { x: 0, y: -1, z: 0 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 2048, seed: "R05-receiver-focus" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: false, id: "none", validContainment: true },
  expected: { domain: "receiver", terminalEvent: "receiver-hit", deliveredPositive: true, closureStatus: "closed", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: { ...COMMON_TOLERANCE, fluxRelative: 0.01 },
} as const satisfies OpticalEventFixedCase;

export const R05_RECEIVER_ABSORBING_MEDIUM = {
  id: "R05-receiver-absorbing-medium",
  geometry: COMMON_GEOMETRY,
  physicalScale: COMMON_SCALE,
  reference: { ...COMMON_CENTERLINE_REFERENCE, intent: "centerline-transmission" },
  material: { ...COMMON_MATERIAL, hostAbsorptionPerMm: { r: 0.01, g: 0.02, b: 0.04 } },
  camera: { x: 0, y: 0, z: 4 },
  light: { propagation: { x: 0, y: -1, z: 0 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 2048, seed: "R05-receiver-absorbing-medium" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: false, id: "none", validContainment: true },
  expected: { domain: "receiver", terminalEvent: "receiver-hit", deliveredPositive: true, closureStatus: "not-computable", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: { ...COMMON_TOLERANCE, throughput: 1e-6, fluxRelative: 0.05 },
} as const satisfies OpticalEventFixedCase;

export const R05_BOUNDARY_EVENT_LIMIT = {
  id: "R05-boundary-event-limit",
  geometry: { ...COMMON_GEOMETRY, hostRadius: 1.5, inclusionRadius: 0.4 },
  physicalScale: COMMON_SCALE,
  reference: { ...COMMON_CENTERLINE_REFERENCE, maxEvents: 2, intent: "straight-boundary-limit" },
  material: COMMON_MATERIAL,
  camera: { x: 0, y: 0, z: 4 },
  light: { propagation: { x: 0, y: 0, z: -1 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 1, seed: "R05-boundary-event-limit" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: true, id: "inclusion-limit", validContainment: true },
  expected: { domain: "receiver", diagnosticTermination: "unresolved", closureStatus: "closed", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: COMMON_TOLERANCE,
} as const satisfies OpticalEventFixedCase;

export const R05_INCLUSION_PASS = {
  id: "R05-inclusion-pass",
  geometry: { ...COMMON_GEOMETRY, hostRadius: 1.5, inclusionRadius: 0.35 },
  physicalScale: COMMON_SCALE,
  reference: { ...COMMON_CENTERLINE_REFERENCE, maxEvents: 8, intent: "straight-inclusion-pass" },
  material: { ...COMMON_MATERIAL, hostAbsorptionPerMm: { r: 0.005, g: 0.005, b: 0.005 }, inclusionAbsorptionPerMm: { r: 0.001, g: 0.02, b: 0.04 } },
  camera: { x: 0, y: 0, z: -4 },
  light: { propagation: { x: 0, y: 0, z: -1 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 1, seed: "R05-inclusion-pass" },
  receiver: { ...COMMON_RECEIVER, planePoint: { x: 0, y: 0, z: -2.35 }, normal: { x: 0, y: 0, z: 1 } },
  inclusion: { enabled: true, id: "inclusion-a", validContainment: true },
  expected: { domain: "receiver", terminalEvent: "receiver-hit", deliveredPositive: true, closureStatus: "closed", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: { ...COMMON_TOLERANCE, throughput: 1e-5 },
} as const satisfies OpticalEventFixedCase;

export const R05_SHADOW_COVERAGE = {
  id: "R05-shadow-coverage",
  geometry: COMMON_GEOMETRY,
  physicalScale: COMMON_SCALE,
  reference: { pureField: { width: 16, height: 16, minU: -16, minV: -16, sizeU: 32, sizeV: 32 } },
  material: COMMON_MATERIAL,
  camera: { x: 4, y: 2.5, z: 5 },
  light: { propagation: { x: 0, y: -1, z: 0 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 2048, seed: "R05-shadow-coverage" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: false, id: "none", validContainment: true },
  expected: { domain: "receiver", closureStatus: "closed", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: { ...COMMON_TOLERANCE, coverage: 5e-6 },
} as const satisfies OpticalEventFixedCase;

export const R05_RECEIVER_ESCAPED = {
  id: "R05-receiver-escaped",
  geometry: COMMON_GEOMETRY,
  physicalScale: COMMON_SCALE,
  reference: { rayDirection: NORMALIZED_ESCAPED_DIRECTION, intent: "normalized-out-of-domain", receiverExpectation: "out-of-domain" },
  material: COMMON_MATERIAL,
  camera: { x: 4, y: 2.5, z: 5 },
  light: { propagation: NORMALIZED_ESCAPED_DIRECTION, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 1, seed: "R05-receiver-escaped" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: false, id: "none", validContainment: true },
  expected: { domain: "receiver", diagnosticTermination: "escaped", escapedPositive: true, closureStatus: "closed", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: { ...COMMON_TOLERANCE, fluxRelative: 1e-12 },
} as const satisfies OpticalEventFixedCase;

export const R05_INVALID_PATH_REJECTED = {
  id: "R05-invalid-path-rejected",
  geometry: { ...COMMON_GEOMETRY, inclusionCenter: { x: 1.2, y: 0, z: 0 }, inclusionRadius: 0.4 },
  physicalScale: COMMON_SCALE,
  reference: { intent: "invalid-containment" },
  material: COMMON_MATERIAL,
  camera: { x: 0, y: 0, z: 4 },
  light: { propagation: { x: 0, y: 0, z: -1 }, radiance: { r: 1, g: 1, b: 1 }, sampleWeight: 1, sampleCount: 1, seed: "R05-invalid-path-rejected" },
  receiver: COMMON_RECEIVER,
  inclusion: { enabled: true, id: "invalid-inclusion", validContainment: false },
  expected: { domain: "receiver", diagnosticTermination: "rejected", closureStatus: "closed", receiverFluxMustStaySeparate: true, coverageIsScalar: true },
  tolerance: COMMON_TOLERANCE,
} as const satisfies OpticalEventFixedCase;

export const OPTICAL_EVENT_FIXED_CASES = [
  R05_VIEW_SURFACE_REFLECTION,
  R05_VIEW_SIMPLE_TRANSMISSION,
  R05_PATH_INTERNAL_REFLECTION,
  R05_RECEIVER_FOCUS,
  R05_RECEIVER_ABSORBING_MEDIUM,
  R05_BOUNDARY_EVENT_LIMIT,
  R05_INCLUSION_PASS,
  R05_SHADOW_COVERAGE,
  R05_RECEIVER_ESCAPED,
  R05_INVALID_PATH_REJECTED,
] as const satisfies readonly OpticalEventFixedCase[];
