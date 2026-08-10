import type { CameraFit, FormGeometry, FormObservationSettings, FormPointSet } from "./contracts.ts";

export interface FormPngMetadata { readonly version: string; readonly updatedAt: string; readonly geometry: FormGeometry; }
export type FormPngScale = 1 | 2;
export const FORM_PNG_BASE_SIZE = { width: 1600, height: 1120 } as const;

export function formPngDimensions(scale: FormPngScale): { readonly width: number; readonly height: number } {
  return { width: FORM_PNG_BASE_SIZE.width * scale, height: FORM_PNG_BASE_SIZE.height * scale };
}

export function describeFormPng(pointSet: FormPointSet, metadata: FormPngMetadata, settings: Pick<FormObservationSettings, "layout" | "activePanel">): { readonly panelNames: readonly string[]; readonly footer: string; readonly assumptions: string } {
  const panelNames = settings.layout === "quad" ? ["XZ / TOP", "XY / FRONT", "ZY / SIDE", "PRINCIPAL / PCA"] : [settings.activePanel.toUpperCase()];
  return {
    panelNames,
    footer: `Hikari ${metadata.version} · Updated ${metadata.updatedAt} · source ${metadata.geometry.revision} · ${metadata.geometry.contentHash.slice(0, 12)} · ${pointSet.pointCount.toLocaleString()} points`,
    assumptions: `Experimental FORM — current ${settings.layout} view; approximate SDF surface; physical scale unknown; candidate density is biased.`,
  };
}

export function composeFormPng(pointSet: FormPointSet, fit: CameraFit, metadata: FormPngMetadata, settings: Pick<FormObservationSettings, "layout" | "activePanel" | "zoom" | "pan" | "pointSize">, outputScale: FormPngScale = 1): HTMLCanvasElement {
  const dimensions = formPngDimensions(outputScale);
  const canvas = document.createElement("canvas"); canvas.width = dimensions.width; canvas.height = dimensions.height;
  const context = canvas.getContext("2d")!;
  // Keep the authored layout in stable logical pixels while the backing canvas
  // gains real output pixels. Fonts, rules, and points all scale together.
  context.scale(outputScale, outputScale);
  const description = describeFormPng(pointSet, metadata, settings);
  context.fillStyle = "#f2efe7"; context.fillRect(0, 0, FORM_PNG_BASE_SIZE.width, FORM_PNG_BASE_SIZE.height);
  const panels = settings.layout === "quad" ? [{ x: 42, y: 72 }, { x: 812, y: 72 }, { x: 42, y: 572 }, { x: 812, y: 572 }] : [{ x: 42, y: 72 }];
  const size = settings.layout === "quad" ? { width: 746, height: 454 } : { width: 1516, height: 954 };
  context.strokeStyle = "#b8b3a8"; context.lineWidth = 1;
  context.fillStyle = "#173d4b"; context.font = "12px system-ui";
  fit.frames.filter((frame) => settings.layout === "quad" || frame.name === settings.activePanel).forEach((frame, frameIndex) => {
    const panel = panels[frameIndex]; context.strokeRect(panel.x, panel.y, size.width, size.height);
    context.fillText(description.panelNames[frameIndex], panel.x + 12, panel.y + 20);
    for (let index = 0; index < pointSet.positions.length; index += 3) {
      const x = pointSet.positions[index]; const y = pointSet.positions[index + 1]; const z = pointSet.positions[index + 2];
      const a = x * frame.horizontalAxis[0] + y * frame.horizontalAxis[1] + z * frame.horizontalAxis[2];
      const b = x * frame.verticalAxis[0] + y * frame.verticalAxis[1] + z * frame.verticalAxis[2];
      const scale = Math.min(size.width, size.height) / (fit.orthographicSpan / settings.zoom);
      context.fillRect(panel.x + size.width / 2 + (a - frame.center[0] - settings.pan[0] * fit.orthographicSpan / settings.zoom) * scale, panel.y + size.height / 2 - (b - frame.center[1] - settings.pan[1] * fit.orthographicSpan / settings.zoom) * scale, settings.pointSize, settings.pointSize);
    }
  });
  context.fillStyle = "#555751"; context.font = "11px system-ui";
  context.fillText(description.footer, 42, 1080);
  context.fillText(description.assumptions, 42, 1100);
  return canvas;
}
