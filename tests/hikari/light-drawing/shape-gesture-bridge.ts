import { integrateFluxRgb, type FluxRgb } from "../../../src/studies/cloud-sculpt/receiverTransport.ts";
import { OpticsLayer, type CausticField } from "../../../src/studies/cloud-sculpt/optics.ts";
import { BACKLIGHT_STUDY_SHAPE_SOURCE, SHAPE_SOURCE_REFERENCE_SETTINGS } from "./shape-source-reference.fixture.ts";
import {
  SHAPE_GESTURE_BRIDGE_SAMPLE_COUNT,
  SHAPE_GESTURE_BRIDGE_SUN_SIZE,
  shapeForGestureBridge,
  type ShapeGestureBridgeResult,
} from "./shape-gesture-bridge.fixture.ts";

export interface ShapeGestureBridgeSummary {
  readonly integratedDepositedRgb: FluxRgb;
  readonly inDomainDepositCount: number;
  readonly outOfDomainDepositCount: number;
  readonly closureResidualRgb: FluxRgb;
  readonly relativeClosureResidual: number;
}

export function gestureBridgeSettings() {
  return { ...SHAPE_SOURCE_REFERENCE_SETTINGS, sunSize: SHAPE_GESTURE_BRIDGE_SUN_SIZE };
}

export function runShapeGestureBridgeCase(
  layer: OpticsLayer,
  gesture: "OFF" | number,
): { field: CausticField; sampleCount: number; summary: ShapeGestureBridgeSummary; bridge: typeof BACKLIGHT_STUDY_SHAPE_SOURCE | ShapeGestureBridgeResult } {
  const bridge = gesture === "OFF" ? shapeForGestureBridge("OFF") : shapeForGestureBridge(gesture);
  const shape = "shape" in bridge ? bridge.shape : bridge;
  const result = layer.runCpuShapeSourceReferenceCase(shape, gestureBridgeSettings(), {
    sampleCount: SHAPE_GESTURE_BRIDGE_SAMPLE_COUNT,
  });
  const diagnostics = result.field.diagnostics;
  return {
    field: result.field,
    sampleCount: result.sampleCount,
    bridge,
    summary: {
      integratedDepositedRgb: integrateFluxRgb(result.field),
      inDomainDepositCount: diagnostics.inDomainDepositCount,
      outOfDomainDepositCount: diagnostics.outOfDomainDepositCount,
      closureResidualRgb: diagnostics.energyLedger.residualRgb,
      relativeClosureResidual: diagnostics.energyLedger.relativeResidual,
    },
  };
}
