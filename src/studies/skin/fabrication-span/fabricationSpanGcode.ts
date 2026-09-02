import { materialSpanPathLengthMm } from "./fabricationSpanPath.ts";
import { assertValidMaterialSpanCoupon, assertValidMaterialSpanMotions } from "./fabricationSpanValidation.ts";
import type {
  FabricationParameters,
  MaterialSpanCoupon,
  MaterialSpanGcodeArtifact,
  MaterialSpanMetadata,
  MaterialSpanMotion,
  MaterialSpanVariantId,
  Mm,
  Point3Mm,
} from "./fabricationSpanTypes.ts";

const encoder = new TextEncoder();

function formatMm(value: number): string {
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function formatExtrusion(value: number): string {
  return value.toFixed(5);
}

function distanceMm(a: Point3Mm, b: Point3Mm): Mm {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * v0 is deterministic, not a volumetric slicer. We model the deposited span
 * bead as nozzle-width squared and divide its volume by the 1.75 mm filament
 * cross-section. The multiplier is intentionally exposed for physical tests.
 */
export function calculateExtrusionLengthMm(
  pathLengthMm: Mm,
  parameters: Pick<FabricationParameters, "nozzleDiameterMm" | "filamentDiameterMm" | "extrusionMultiplier">,
  depositedCrossSectionMm2 = parameters.nozzleDiameterMm ** 2,
): Mm {
  const filamentAreaMm2 = Math.PI * (parameters.filamentDiameterMm / 2) ** 2;
  return pathLengthMm * parameters.extrusionMultiplier * depositedCrossSectionMm2 / filamentAreaMm2;
}

function g1(target: Point3Mm, absoluteExtrusionMm?: Mm, feedMmPerMin?: number): string {
  const fields = [`G1 X${formatMm(target.x)}`, `Y${formatMm(target.y)}`, `Z${formatMm(target.z)}`];
  if (absoluteExtrusionMm !== undefined) fields.push(`E${formatExtrusion(absoluteExtrusionMm)}`);
  if (feedMmPerMin !== undefined) fields.push(`F${formatMm(feedMmPerMin)}`);
  return fields.join(" ");
}

function g0(target: Point3Mm, feedMmPerMin: number): string {
  return `G0 X${formatMm(target.x)} Y${formatMm(target.y)} Z${formatMm(target.z)} F${formatMm(feedMmPerMin)}`;
}

export interface MaterialSpanGcodeOptions {
  variantId: MaterialSpanVariantId;
  generatorCommit: string;
}

export function generateMaterialSpanGcode(
  coupon: MaterialSpanCoupon,
  options: MaterialSpanGcodeOptions,
): MaterialSpanGcodeArtifact {
  assertValidMaterialSpanCoupon(coupon);
  const { parameters } = coupon;
  const lines: string[] = [
    "; KATACHI FABRICATION SPAN V0",
    "; REVIEW ONLY — human review required before any use",
    "; NO AUTOMATIC UPLOAD / NO AUTOMATIC PRINT START",
    "; MACHINE: Bambu Lab A1",
    `; NOZZLE_DIAMETER_MM: ${formatMm(parameters.nozzleDiameterMm)}`,
    "; MATERIAL: PLA",
    `; FILAMENT_DIAMETER_MM: ${formatMm(parameters.filamentDiameterMm)}`,
    `; NOZZLE_TEMPERATURE_C: ${formatMm(parameters.nozzleTemperatureC)}`,
    `; BED_TEMPERATURE_C: ${formatMm(parameters.bedTemperatureC)}`,
    `; FAN_PERCENT: ${formatMm(parameters.fanPercent)}`,
    `; VARIANT: ${options.variantId}`,
    `; PRINT_SPEED_MM_PER_SEC: ${formatMm(parameters.printSpeedMmPerSec)}`,
    `; EXTRUSION_MULTIPLIER: ${formatMm(parameters.extrusionMultiplier)}`,
    `; SPAN_LIFT_MM: ${formatMm(parameters.spanLiftMm)}`,
    `; SPAN_PATH_LENGTH_MM: ${formatMm(materialSpanPathLengthMm(coupon.path))}`,
    "; COORDINATES: absolute machine-space millimetres; verify plate position in Bambu Studio",
    "; STARTUP CONTRACT: G90 + M82 + G92 E0 only; no guessed A1 homing/heater macro",
    "; G90",
    "G90",
    "; M82",
    "M82",
    "G92 E0",
    "; PHASE A — conventional low-risk anchor towers",
  ];
  const motions: MaterialSpanMotion[] = [];
  let currentPosition: Point3Mm | undefined;
  let absoluteExtrusionMm = 0;
  const feed = (speedMmPerSec: number): number => speedMmPerSec * 60;

  const appendTravel = (target: Point3Mm): void => {
    lines.push(g0(target, feed(parameters.travelSpeedMmPerSec)));
    if (currentPosition) {
      motions.push({
        kind: "travel",
        start: currentPosition,
        end: target,
        feedMmPerMin: feed(parameters.travelSpeedMmPerSec),
        extrusionDeltaMm: 0,
        absoluteExtrusionMm,
      });
    }
    currentPosition = target;
  };

  const appendExtrusion = (target: Point3Mm, depositedCrossSectionMm2: number, speedMmPerSec = parameters.printSpeedMmPerSec): void => {
    if (!currentPosition) throw new Error("Material Span G-code invariant: extrusion has no current position");
    const length = distanceMm(currentPosition, target);
    const delta = calculateExtrusionLengthMm(length, parameters, depositedCrossSectionMm2);
    absoluteExtrusionMm += delta;
    lines.push(g1(target, absoluteExtrusionMm, feed(speedMmPerSec)));
    motions.push({
      kind: "extrusion",
      start: currentPosition,
      end: target,
      feedMmPerMin: feed(speedMmPerSec),
      extrusionDeltaMm: delta,
      absoluteExtrusionMm,
    });
    currentPosition = target;
  };

  const appendAnchorTower = (anchor: Point3Mm, label: string): void => {
    lines.push(`; ANCHOR ${label} — ${formatMm(anchor.x)},${formatMm(anchor.y)},${formatMm(anchor.z)} mm`);
    const halfWidth = coupon.anchorWidthMm / 2;
    const halfDepth = coupon.anchorDepthMm / 2;
    const corners = (z: number): Point3Mm[] => [
      { x: anchor.x - halfWidth, y: anchor.y - halfDepth, z },
      { x: anchor.x + halfWidth, y: anchor.y - halfDepth, z },
      { x: anchor.x + halfWidth, y: anchor.y + halfDepth, z },
      { x: anchor.x - halfWidth, y: anchor.y + halfDepth, z },
    ];
    const layerCount = Math.ceil(anchor.z / parameters.layerHeightMm);
    for (let layer = 1; layer <= layerCount; layer += 1) {
      const z = Math.min(anchor.z, layer * parameters.layerHeightMm);
      const perimeter = corners(z);
      appendTravel(perimeter[0]);
      for (let index = 1; index <= perimeter.length; index += 1) {
        appendExtrusion(perimeter[index % perimeter.length], parameters.nozzleDiameterMm * parameters.layerHeightMm);
      }
    }

    // A small cross caps the tower without introducing a slicer or a second
    // unknown: the span attaches to a material-bearing top centre.
    const capZ = anchor.z;
    const capLeft = { x: anchor.x - halfWidth + parameters.nozzleDiameterMm, y: anchor.y, z: capZ };
    const capRight = { x: anchor.x + halfWidth - parameters.nozzleDiameterMm, y: anchor.y, z: capZ };
    const capBottom = { x: anchor.x, y: anchor.y - halfDepth + parameters.nozzleDiameterMm, z: capZ };
    const capTop = { x: anchor.x, y: anchor.y + halfDepth - parameters.nozzleDiameterMm, z: capZ };
    appendTravel(capLeft);
    appendExtrusion(capRight, parameters.nozzleDiameterMm * parameters.layerHeightMm);
    appendTravel(capBottom);
    appendExtrusion(capTop, parameters.nozzleDiameterMm * parameters.layerHeightMm);
  };

  appendAnchorTower(coupon.anchors.a.positionMm, coupon.anchors.a.id);
  appendAnchorTower(coupon.anchors.b.positionMm, coupon.anchors.b.id);
  lines.push("; PHASE B — one-way Material Span, A → B; final shape is not predicted");
  appendTravel(coupon.path.points[0]);
  for (let index = 1; index < coupon.path.points.length; index += 1) {
    appendExtrusion(coupon.path.points[index], parameters.nozzleDiameterMm ** 2);
  }
  lines.push("; END CONTRACT: no heater, fan, homing, upload, or print-start command is emitted");
  lines.push("; Human must inspect the file and set up the A1 through its normal UI/Bambu Studio flow.");

  assertValidMaterialSpanMotions(coupon, motions);
  const metadata: MaterialSpanMetadata = {
    study: "skin-fabrication-span",
    version: "0.1.0",
    generatorVersion: "fabrication-span-v0",
    generatorCommit: options.generatorCommit,
    machine: "Bambu Lab A1",
    nozzleDiameterMm: parameters.nozzleDiameterMm,
    filament: "PLA",
    filamentDiameterMm: parameters.filamentDiameterMm,
    extrusionMode: "absolute",
    coordinateContract: "machine-absolute-mm",
    anchorA: { ...coupon.anchors.a.positionMm },
    anchorB: { ...coupon.anchors.b.positionMm },
    pathPoints: coupon.path.points.map((point) => ({ ...point })),
    parameters: { ...parameters },
    physicalInterpretation: "commanded-path-only; measure-final-filament",
  };
  const gcode = `${lines.join("\n")}\n`;
  return {
    fileName: `skin-material-span-v0-${options.variantId}.gcode`,
    gcode,
    metadata,
    motions,
    validation: { ok: true, errors: [] },
    lineCount: lines.length,
    byteLength: encoder.encode(gcode).byteLength,
  };
}
