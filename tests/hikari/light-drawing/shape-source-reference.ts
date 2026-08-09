import { integrateFluxRgb, type FluxRgb } from "../../../src/studies/cloud-sculpt/receiverTransport.ts";
import { OpticsLayer, type CausticField } from "../../../src/studies/cloud-sculpt/optics.ts";
import {
  BACKLIGHT_STUDY_SHAPE_SOURCE,
  settingsForShapeSourceReferencePanel,
  type SHAPE_SOURCE_REFERENCE_PANELS,
} from "./shape-source-reference.fixture.ts";

export type ShapeSourceReferencePanel = typeof SHAPE_SOURCE_REFERENCE_PANELS[number];

export interface ShapeSourceReferenceSummary {
  integratedDepositedRgb: FluxRgb;
  inDomainDepositCount: number;
  outOfDomainDepositCount: number;
  closureResidualRgb: FluxRgb;
  relativeClosureResidual: number;
}

export function runShapeSourceReferencePanel(
  layer: OpticsLayer,
  panel: ShapeSourceReferencePanel,
): { field: CausticField; summary: ShapeSourceReferenceSummary } {
  const result = layer.runCpuShapeSourceReferenceCase(
    BACKLIGHT_STUDY_SHAPE_SOURCE,
    settingsForShapeSourceReferencePanel(panel),
    { sampleCount: panel.sampleCount },
  );
  const diagnostics = result.field.diagnostics;
  return {
    field: result.field,
    summary: {
      integratedDepositedRgb: integrateFluxRgb(result.field),
      inDomainDepositCount: diagnostics.inDomainDepositCount,
      outOfDomainDepositCount: diagnostics.outOfDomainDepositCount,
      closureResidualRgb: diagnostics.energyLedger.residualRgb,
      relativeClosureResidual: diagnostics.energyLedger.relativeResidual,
    },
  };
}
