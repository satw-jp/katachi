import type { Ball } from "../cloud-sculpt/field.ts";
import type { CoverageReport, MortarReport, Patch } from "./field.ts";
import type { SkinLinkingReport, SkinOverlapWarning } from "./linking.ts";

export interface GaugeBuildRequest {
  type: "build";
  generation: number;
  host: Ball[];
  hostK: number;
  thickness: number;
  patches: Patch[];
  roundK: number;
  targetLongestMm: number;
}

export type GaugeWorkerMessage = {
  type: "result";
  generation: number;
  mortar: MortarReport;
  coverage: CoverageReport;
  patchComponents: number;
  mmPerUnit: number;
  linking: SkinLinkingReport;
  overlaps: SkinOverlapWarning[];
} | {
  type: "error";
  generation: number;
  message: string;
};
