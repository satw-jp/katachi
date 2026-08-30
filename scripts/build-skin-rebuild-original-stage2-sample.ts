import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { growBalls, resetBallIdCounter } from "../src/studies/cloud-sculpt/field.ts";
import {
  DEFAULT_SKIN_PARAMS,
  packPatchesGreedy,
  resetPatchIdCounter,
} from "../src/studies/skin/field.ts";
import {
  DEFAULT_SKIN_HOST_PARAMS,
  replayDetached,
  type SkinHistoryEntry,
} from "../src/studies/skin/history.ts";
import {
  captureFkei,
  parseFkeiDocument,
  serializeFkei,
} from "../src/studies/skin/fkei.ts";
import { fkeiShapeFingerprint } from "../src/studies/skin/fkeiRestoreIdentity.ts";
import { createFkeiRestorePlan } from "../src/studies/skin/fkeiRuntimeRestore.ts";
import manifest from "../src/studies/skin/manifest.json";

const outputDirectory = resolve(process.argv[2] ?? "public/samples");
const baseName = "skin-rebuild-original-stage2";
const generatorCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
const savedAt = "2026-08-29T12:00:00.000Z";

resetBallIdCounter(1);
resetPatchIdCounter(1);
const hostParams = { ...DEFAULT_SKIN_HOST_PARAMS };
const host = growBalls(hostParams);
const skinParams = { ...DEFAULT_SKIN_PARAMS };
const packed = packPatchesGreedy(host, hostParams.k, [], skinParams);
if (host.length !== 12) throw new Error(`Original Base Shape parity failed: ${host.length} host balls`);
if (packed.patches.length === 0) throw new Error("Original Surface Pattern generation produced no patches");

const entries: SkinHistoryEntry[] = [
  {
    t: 1,
    op: "loadHostFromS1Recipe",
    args: { balls: host, params: hostParams, source: "skin-rebuild-original-stage2" },
  },
  { t: 2, op: "packPatches", args: { patches: packed.patches, identity: "replace" } },
];
const state = replayDetached(entries);
const document = captureFkei({
  savedAt,
  compatibility: { appVersion: manifest.version, generatorCommit },
  completedStage: 2,
  shape: { formatVersion: 1, entries },
  bindings: {
    shapeFingerprint: fkeiShapeFingerprint(state),
    patchSetRevision: state.patchSetRevision,
    paintRevision: 0,
  },
});
const text = serializeFkei(document);
const plan = createFkeiRestorePlan(parseFkeiDocument(text));
if (plan.completedStage !== 2) throw new Error("Original FKEI roundtrip did not restore Stage 2");
if (plan.shapeState.host.length !== host.length || plan.shapeState.patches.length !== packed.patches.length) {
  throw new Error("Original FKEI roundtrip changed Base Shape or Surface Pattern counts");
}

const validation = {
  schema: "katachi.skin-rebuild.original-stage2-validation.v1",
  generatedAt: savedAt,
  generatorCommit,
  appVersion: manifest.version,
  printApproval: false,
  completedStage: plan.completedStage,
  sourceUi: "src/studies/skin/main.ts + ui.ts + renderer.ts",
  originalUiPreserved: {
    projectBar: true,
    leftToolsPane: true,
    rightWorkflowPane: true,
    bottomStatusPane: true,
    oneAndFourViewportModes: true,
  },
  baseShape: { hostBalls: plan.shapeState.host.length, params: plan.shapeState.hostParams },
  surfacePattern: {
    patches: plan.shapeState.patches.length,
    realizedPoints: plan.shapeState.patches.reduce((sum, patch) => sum + patch.points.length, 0),
    generationMode: plan.shapeState.skinParams.surfaceGenerationMode,
    motif: plan.shapeState.skinParams.patchShape,
  },
  fkei: {
    filename: `${baseName}.fkei`,
    bytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
    parsedByOriginalRuntime: true,
  },
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, `${baseName}.fkei`), text, "utf8");
writeFileSync(resolve(outputDirectory, `${baseName}.validation.json`), `${JSON.stringify(validation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputDirectory, ...validation }, null, 2));
