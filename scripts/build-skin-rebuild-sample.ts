import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  encodeBinaryStl,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
} from "../src/studies/cloud-sculpt/meshExport.ts";
import {
  buildSkinRebuildProject,
  exportSkinRebuildStl,
} from "../src/studies/skin/rebuild/model.ts";
import { buildPrintSupportMesh } from "../src/studies/skin/meshExport.ts";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "../src/studies/skin/rebuild/fkei.ts";
import {
  DEFAULT_SKIN_HOST_PARAMS,
  serializeRecipe,
  type SkinHistoryEntry,
} from "../src/studies/skin/history.ts";
import manifest from "../src/studies/skin/manifest.json";

const outputDirectory = resolve(process.argv[2] ?? "public/samples");
const writeStl = process.argv.includes("--with-stl");
const baseName = "skin-rebuild-first-print";
const sampleTimestamp = "2026-08-30T12:00:00.000Z";
const generatorCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const startedAt = Date.now();
const { project } = buildSkinRebuildProject();
const history: SkinHistoryEntry[] = [
  {
    t: 1,
    op: "loadHostFromS1Recipe",
    args: {
      balls: project.base.host.map((ball) => ({ ...ball })),
      params: { ...DEFAULT_SKIN_HOST_PARAMS, count: project.base.host.length, k: project.base.hostK },
      source: "skin-rebuild-first-print",
    },
  },
  { t: 2, op: "setSkinParam", args: { key: "thickness", value: project.settings.surfaceThickness } },
  { t: 3, op: "setSkinParam", args: { key: "roundK", value: project.settings.roundK } },
  { t: 4, op: "setSkinParam", args: { key: "internalStructure", value: "targetedGrid" } },
  {
    t: 5,
    op: "packPatches",
    args: {
      patches: project.patterns.map((patch) => ({
        ...patch,
        points: patch.points.map((point) => ({ ...point })),
      })),
      identity: "replace",
    },
  },
];
const recipe = JSON.parse(serializeRecipe(history)) as { exportedAt: string };
recipe.exportedAt = sampleTimestamp;
const document = captureSkinRebuildFkei(project, {
  savedAt: sampleTimestamp,
  appVersion: manifest.version,
  generatorCommit,
  shapeRecipe: JSON.stringify(recipe, null, 2),
});
const fkei = serializeSkinRebuildFkei(document);
const restored = projectFromSkinRebuildFkei(parseSkinRebuildFkei(fkei));
if (JSON.stringify(restored.audit) !== JSON.stringify(project.audit)) throw new Error("FKEI roundtrip changed audit facts");

const artifact = exportSkinRebuildStl(restored, `${baseName}.stl`);
const stl = new Uint8Array(artifact.stl);
const rawSupport = buildPrintSupportMesh(restored.printSupport, artifact.mesh.scaleMmPerUnit, {
  sourceOffset: { x: 0, y: 0, z: artifact.mesh.plateShiftSourceZ ?? 0 },
  extendVerticalRootsToPlateZ: 0,
});
const supportMesh = orientMeshForSavedStl(rawSupport);
const supportTopology = inspectSavedStlTopology(supportMesh.triangles, supportMesh.scaleMmPerUnit);
if (!supportTopology.ok) throw new Error("separate print-support STL topology failed");
const supportStl = new Uint8Array(encodeBinaryStl(supportMesh, `${baseName}-print-support.stl`));
const validation = {
  schema: "katachi.skin-rebuild.first-print-validation.v1",
  generatedAt: sampleTimestamp,
  generatorCommit,
  algorithmVersion: project.algorithmVersion,
  printApproval: false,
  slicerPreview: "not-run",
  physicalPrint: "not-run",
  settings: project.settings,
  audit: project.audit,
  mesh: {
    resolution: project.settings.exportResolution,
    triangleCount: artifact.mesh.triangles.length,
    boundsMm: artifact.mesh.mmBounds,
    scaleMmPerUnit: artifact.mesh.scaleMmPerUnit,
    topology: artifact.topology,
  },
  files: {
    fkei: { filename: `${baseName}.fkei`, bytes: Buffer.byteLength(fkei), sha256: sha256(fkei) },
    stl: { filename: `${baseName}.stl`, bytes: stl.byteLength, sha256: sha256(stl), written: writeStl },
    printSupportStl: { filename: `${baseName}-print-support.stl`, bytes: supportStl.byteLength, sha256: sha256(supportStl), written: writeStl },
  },
  printSupport: {
    edgeCount: restored.printSupport.edges.length,
    triangleCount: supportMesh.triangles.length,
    boundsMm: supportMesh.mmBounds,
    sharedBodyPlateShiftSourceZ: artifact.mesh.plateShiftSourceZ ?? 0,
    zOriginDeltaMm: supportMesh.mmBounds.min.z - artifact.mesh.mmBounds.min.z,
    topology: supportTopology,
  },
  elapsedMs: Date.now() - startedAt,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, `${baseName}.fkei`), fkei, "utf8");
writeFileSync(resolve(outputDirectory, `${baseName}.validation.json`), `${JSON.stringify(validation, null, 2)}\n`, "utf8");
if (writeStl) writeFileSync(resolve(outputDirectory, `${baseName}.stl`), stl);
if (writeStl) writeFileSync(resolve(outputDirectory, `${baseName}-print-support.stl`), supportStl);
console.log(JSON.stringify({ outputDirectory, writeStl, ...validation }, null, 2));
