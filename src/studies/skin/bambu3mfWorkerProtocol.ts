import type { Bambu3mfStats, BambuSupportType } from "./bambu3mf.ts";
import type { ExternalScaffoldStats } from "./externalScaffold.ts";
import type { PrintValidationFactsV1, ResolvedPrintPlan } from "./printProfile.ts";
import type { SupportReachabilityFacts } from "./supportReachability.ts";
import type { OverhangAssignmentCounts } from "./overhangSupportPolicy.ts";
import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { SkinMeshOptions } from "./meshExport.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import type { FusedScaffoldPlateAnchorReport } from "./scaffoldFusion.ts";

export interface SupportReachabilityStats extends SupportReachabilityFacts {
  candidateFaceCount: number;
  keptFaceCount: number;
  rejectedFaceCount: number;
  invalidCandidateFaceCount: number;
  unresolvedCandidateFaceCount: number;
}

export interface FusedSkinMeshInput {
  mode: SkinMode;
  host: Ball[];
  hostK: number;
  thickness: number;
  patches: Patch[];
  roundK: number;
  options: SkinMeshOptions;
  coinBulge: number;
  quadMeshJoinWidth: number;
  coinBulgeBalance: number;
  internalGraph: InternalStructureGraph | null;
}

export interface Bambu3mfExportRequest {
  type: "export";
  requestId: number;
  generation: number;
  /** Exact gate STL in mm when Internal Structure is present. */
  bodyStl?: ArrayBuffer;
  /** Final Surface triangle soup in source units when no gate STL is needed. */
  bodyPositions?: Float32Array;
  /** Exact final Surface triangle soup, used for reachability and the outer XY hull. */
  finalSurfacePositions: Float32Array;
  dangerousPositions: Float32Array;
  scaleMmPerUnit: number;
  printPlan: ResolvedPrintPlan;
  /** Required for a print candidate: remesh BODY + Internal + scaffold as one watertight field. */
  fusedMeshInput: FusedSkinMeshInput;
  supportType: BambuSupportType;
  title: string;
  generatorVersion: string;
}

export type Bambu3mfProgressStage =
  | "入力を準備"
  | "危険面の到達性を判定"
  | "支柱を選択"
  | "最終一体メッシュを生成"
  | "トポロジーを検査"
  | "初層パッドを検査"
  | "3MFを圧縮";

export type Bambu3mfWorkerMessage = {
  type: "progress";
  requestId: number;
  generation: number;
  stage: Bambu3mfProgressStage;
  stageIndex: number;
  stageCount: number;
  detail?: string;
  elapsedMs: number;
} | {
  type: "result";
  requestId: number;
  generation: number;
  archive: ArrayBuffer;
  stats: Bambu3mfStats;
  reachability: SupportReachabilityStats;
  supportPolicy: string;
  classificationCounts: OverhangAssignmentCounts;
  scaffold: ExternalScaffoldStats;
  plateAnchor: FusedScaffoldPlateAnchorReport;
  validationFacts: PrintValidationFactsV1;
  elapsedMs: number;
} | {
  type: "error";
  requestId: number;
  generation: number;
  message: string;
  elapsedMs: number;
};
