import type { SkinRebuildProject } from "./model.ts";
import type {
  SkinRebuildPrintSnapshotData,
  SkinRebuildPrintSnapshotMetadata,
} from "./printSnapshot.ts";

export interface CompletedSampleRestoreRequest {
  type: "restore";
  text: string;
}

export type CompletedSampleRestoreWorkerMessage =
  | {
    type: "progress";
    stage: "document-parsed" | "project-normalized" | "snapshot-decoded";
    elapsedMs: number;
    patternCount?: number;
    supportEdgeCount?: number;
  }
  | {
      type: "result";
      project: SkinRebuildProject;
      shapeRecipe?: string;
      printSnapshot?: SkinRebuildPrintSnapshotMetadata;
      snapshot: SkinRebuildPrintSnapshotData | null;
      workerElapsedMs: number;
    }
  | {
    type: "error";
    message: string;
  };
