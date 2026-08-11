import { normalizeHikariSettings } from "./hikari.ts";
import { createHikariCase, type HikariCase } from "./hikariCase.ts";
import { parseRecipe, replay } from "./history.ts";

/**
 * Consumer adapter for Katachi's canonical `src/lib/hikari` case contract.
 * Hikari owns no second copy of that schema: it validates only the fields it
 * needs to reproduce the shared Cloud Sculpt shape, view, and author controls.
 */
export function parseKatachiInterchangeCase(text: string): HikariCase {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.formatVersion !== 1) invalid("formatVersion");
  const id = nonEmpty(value.id, "id");
  const capturedAtUtc = nonEmpty(value.capturedAtUtc, "capturedAtUtc");
  const appVersion = nonEmpty(value.appVersion, "appVersion");
  const gitCommit = value.gitCommit === null
    ? "unknown"
    : nonEmpty(value.gitCommit, "gitCommit");
  if (!Array.isArray(value.assets)) invalid("assets");
  if (!isRecord(value.scene) || !isRecord(value.scene.host)) invalid("scene.host");
  const hostShapeId = nonEmpty(value.scene.host.shapeAssetId, "scene.host.shapeAssetId");
  const asset = value.assets.find(
    (candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) && candidate.id === hostShapeId,
  );
  if (!asset || !isRecord(asset.source) || asset.source.studyId !== "cloud-sculpt") {
    throw new Error("Katachi case host must be a cloud-sculpt ShapeAsset");
  }
  if (!isRecord(asset.representation) || asset.representation.kind !== "metaballs-v1") {
    throw new Error("Katachi case host must use metaballs-v1");
  }
  if (!Array.isArray(asset.representation.balls)) invalid("representation.balls");
  if (!Number.isFinite(asset.representation.smoothK)) invalid("representation.smoothK");
  const recipeEntries = parseRecipe(JSON.stringify(asset.recipe));
  const replayed = replay(structuredClone(recipeEntries));
  verifyReplayedShape(
    replayed.balls,
    replayed.params.k,
    asset.representation.balls,
    asset.representation.smoothK as number,
  );

  if (!isRecord(value.scene.camera)) invalid("scene.camera");
  const camera = value.scene.camera;
  const position = vectorTuple(camera.position, "scene.camera.position");
  const target = vectorTuple(camera.target, "scene.camera.target");
  const fov = finite(camera.fovYDeg, "scene.camera.fovYDeg");
  if (!isRecord(value.renderer)) invalid("renderer");
  const backendKind = nonEmpty(value.renderer.backend, "renderer.backend");
  const requestedSampleCount = finite(value.renderer.sampleCount, "renderer.sampleCount");
  if (!isRecord(value.controls)) invalid("controls");

  return createHikariCase({
    caseId: id,
    createdAt: capturedAtUtc,
    appVersion,
    commit: gitCommit,
    observation: observationText(value.observation),
    shape: { studyId: "cloud-sculpt", recipeEntries },
    hikariSettings: normalizeHikariSettings(value.controls),
    camera: { position, target, fov },
    compatibility: {
      safeModeQuery: "auto",
      compatibilityMode: backendKind === "cpu",
    },
    backend: {
      kind: backendKind,
      text: `Katachi interchange · ${backendKind}`,
      requestedSampleCount,
    },
  });
}

function verifyReplayedShape(
  replayed: Array<{ id: number; x: number; y: number; z: number; r: number }>,
  replayedSmoothK: number,
  serialized: unknown[],
  serializedSmoothK: number,
): void {
  if (replayedSmoothK !== serializedSmoothK || replayed.length !== serialized.length) {
    throw new Error("Katachi case recipe does not reproduce its ShapeAsset");
  }
  for (let index = 0; index < replayed.length; index++) {
    const actual = replayed[index];
    const expected = serialized[index];
    if (
      !isRecord(expected)
      || String(actual.id) !== String(expected.id)
      || actual.x !== expected.x
      || actual.y !== expected.y
      || actual.z !== expected.z
      || actual.r !== expected.radius
    ) {
      throw new Error(`Katachi case recipe differs from ShapeAsset ball ${index}`);
    }
  }
}

function observationText(value: unknown): string {
  if (!isRecord(value)) return "Katachiから受け取った共有Hikari case";
  const lines: string[] = [];
  for (const [label, candidate] of [
    ["observed", value.observed],
    ["interpretation", value.interpretation],
    ["decision", value.decision],
  ] as const) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (typeof item === "string" && item.trim()) lines.push(`${label}: ${item.trim()}`);
    }
  }
  return lines.join("\n") || "Katachiから受け取った共有Hikari case";
}

function vectorTuple(value: unknown, path: string): [number, number, number] {
  if (!isRecord(value)) invalid(path);
  return [finite(value.x, `${path}.x`), finite(value.y, `${path}.y`), finite(value.z, `${path}.z`)];
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(path);
  return value;
}

function nonEmpty(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(path);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(path: string): never {
  throw new Error(`Invalid Katachi Hikari interchange field: ${path}`);
}
