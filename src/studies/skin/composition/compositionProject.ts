import { sha256Hex } from "../../../lib/hash.ts";
import {
  assertCompositionContinuity,
  buildCompositionBranches,
  compareAnchorPosition,
  DEFAULT_COMPOSITION_RECIPE,
  loadCompositionHost,
  LOCKED_HOST_INPUT,
  type CompositionBranchGraph,
  type CompositionFlower,
  type CompositionRecipe,
  type CompositionState,
  type Quaternion,
  type Vec3,
} from "./compositionModel.ts";
import { loadMotifPrototype, LOCKED_MOTIF_INPUT, type MotifPrototype } from "./motifSource.ts";

export const COMPOSITION_PROJECT_SCHEMA = "katachi.skin.composition.v0" as const;

interface ProjectAssetV0 {
  readonly fileName: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly bytesBase64: string;
}

interface CompositionProjectV0 {
  readonly schema: typeof COMPOSITION_PROJECT_SCHEMA;
  readonly snapshotSha256: string;
  readonly host: ProjectAssetV0 & {
    readonly sourceToScene: {
      readonly units: "mm";
      readonly upAxis: "z";
      readonly handedness: "right";
      readonly scale: 1;
      readonly rotationXYZW: readonly [number, number, number, number];
      readonly translation: Vec3;
    };
    readonly triangleCount: number;
  };
  readonly motif: {
    readonly source: ProjectAssetV0;
    readonly frame: ProjectAssetV0;
    readonly frameRecord: Readonly<Record<string, unknown>>;
    readonly prototype: {
      readonly vertexCount: number;
      readonly faceCount: number;
      readonly verticesFloat32LEBase64: string;
      readonly indicesUint32LEBase64: string;
      readonly anchorLocal: Vec3;
    };
  };
  readonly recipe: CompositionRecipe;
  readonly flowers: readonly CompositionFlower[];
  readonly branches: CompositionBranchGraph;
  readonly presentation: { readonly showHost: boolean };
  readonly status: {
    readonly role: "permanent-structure-draft";
    readonly containment: "UNVERIFIED";
    readonly fabrication: "UNVERIFIED";
    readonly authorAccept: false;
  };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Composition package cannot contain non-finite numbers");
  return value;
}

export function canonicalCompositionJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return btoa(binary);
}

function base64ToBytes(value: unknown, label: string): Uint8Array {
  // Avoid testing very large self-contained host payloads with one anchored
  // RegExp: V8 can exhaust its regexp stack on the 17.8 MB base64 STL string.
  // atob rejects invalid alphabet/padding; exact re-encoding below rejects
  // whitespace and any other non-canonical spelling.
  if (typeof value !== "string" || value.length % 4 !== 0) {
    throw new Error(`${label} is not canonical base64`);
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error(`${label} is not valid base64`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytesToBase64(bytes) !== value) throw new Error(`${label} base64 is not canonical`);
  return bytes;
}

function float32ToLittleEndianBase64(values: Float32Array): string {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) view.setFloat32(index * 4, values[index], true);
  return bytesToBase64(bytes);
}

function uint32ToLittleEndianBase64(values: Uint32Array): string {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) view.setUint32(index * 4, values[index], true);
  return bytesToBase64(bytes);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function asset(fileName: string, sha256: string, bytes: Uint8Array): ProjectAssetV0 {
  return { fileName, sha256, byteLength: bytes.byteLength, bytesBase64: bytesToBase64(bytes) };
}

function projectWithoutDigest(state: CompositionState): Omit<CompositionProjectV0, "snapshotSha256"> {
  assertCompositionContinuity(state);
  const motif: MotifPrototype = state.motif;
  return {
    schema: COMPOSITION_PROJECT_SCHEMA,
    host: {
      ...asset(state.host.fileName, state.host.sourceHash, state.host.bytes),
      sourceToScene: {
        units: "mm",
        upAxis: "z",
        handedness: "right",
        scale: 1,
        rotationXYZW: [0, 0, 0, 1],
        translation: LOCKED_HOST_INPUT.translation,
      },
      triangleCount: state.host.rawMesh.triangleCount,
    },
    motif: {
      source: asset(LOCKED_MOTIF_INPUT.fileName, motif.sourceHash, motif.sourceBytes),
      frame: asset(LOCKED_MOTIF_INPUT.frameFileName, motif.frameHash, motif.frameBytes),
      frameRecord: motif.frame,
      prototype: {
        vertexCount: motif.sourceVertexCount,
        faceCount: motif.sourceFaceCount,
        verticesFloat32LEBase64: float32ToLittleEndianBase64(motif.vertices),
        indicesUint32LEBase64: uint32ToLittleEndianBase64(motif.indices),
        anchorLocal: motif.anchorLocal,
      },
    },
    recipe: state.recipe,
    flowers: state.flowers,
    branches: state.branches,
    presentation: state.presentation,
    status: {
      role: "permanent-structure-draft",
      containment: "UNVERIFIED",
      fabrication: "UNVERIFIED",
      authorAccept: false,
    },
  };
}

export async function serializeCompositionProject(state: CompositionState): Promise<string> {
  const unsigned = projectWithoutDigest(state);
  const snapshotSha256 = await sha256Hex(canonicalCompositionJson(unsigned));
  return JSON.stringify({ ...unsigned, snapshotSha256 });
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function tuple3(value: unknown, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must have three values`);
  return [finiteNumber(value[0], `${label}[0]`), finiteNumber(value[1], `${label}[1]`), finiteNumber(value[2], `${label}[2]`)];
}

function tuple4(value: unknown, label: string): Quaternion {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${label} must have four values`);
  return [finiteNumber(value[0], `${label}[0]`), finiteNumber(value[1], `${label}[1]`), finiteNumber(value[2], `${label}[2]`), finiteNumber(value[3], `${label}[3]`)];
}

function parseRecipe(value: unknown): CompositionRecipe {
  const input = object(value, "Composition recipe");
  const recipe: CompositionRecipe = {
    flowerCount: finiteNumber(input.flowerCount, "recipe.flowerCount"),
    flowerScale: finiteNumber(input.flowerScale, "recipe.flowerScale"),
    seed: finiteNumber(input.seed, "recipe.seed"),
    minAnchorSpacingMm: finiteNumber(input.minAnchorSpacingMm, "recipe.minAnchorSpacingMm"),
    maxSamplingAttempts: finiteNumber(input.maxSamplingAttempts, "recipe.maxSamplingAttempts"),
    flowerOrientationTwistRad: finiteNumber(input.flowerOrientationTwistRad, "recipe.flowerOrientationTwistRad"),
    branchDiameterMm: finiteNumber(input.branchDiameterMm, "recipe.branchDiameterMm"),
    insetMm: finiteNumber(input.insetMm, "recipe.insetMm"),
    branchRecipe: input.branchRecipe as CompositionRecipe["branchRecipe"],
  };
  if (recipe.branchRecipe !== DEFAULT_COMPOSITION_RECIPE.branchRecipe) throw new Error("Unknown composition branch recipe");
  if (!Number.isInteger(recipe.flowerCount) || recipe.flowerCount < 1 || recipe.flowerCount > 128) throw new Error("Restored flower count is invalid");
  if (!(recipe.flowerScale > 0) || !(recipe.minAnchorSpacingMm > 0) || !(recipe.branchDiameterMm > 0) || !(recipe.insetMm > 0)) {
    throw new Error("Restored scale, spacing, inset, and diameter must be positive");
  }
  if (!Number.isInteger(recipe.seed) || recipe.seed < 0 || recipe.seed > 0xffffffff) throw new Error("Restored seed is invalid");
  if (!Number.isInteger(recipe.maxSamplingAttempts) || recipe.maxSamplingAttempts < recipe.flowerCount || recipe.maxSamplingAttempts > 8192) {
    throw new Error("Restored sampling attempt limit is invalid");
  }
  return Object.freeze(recipe);
}

function parseFlowers(value: unknown, recipe: CompositionRecipe): readonly CompositionFlower[] {
  if (!Array.isArray(value) || value.length !== recipe.flowerCount) throw new Error("Saved flower count does not match its recipe");
  const flowers = value.map((item, index) => {
    const input = object(item, `flower[${index}]`);
    const id = input.id;
    if (id !== `flower-${String(index).padStart(4, "0")}`) throw new Error("Saved flower IDs are not in stable recipe order");
    if (!Number.isInteger(input.triangleIndex) || (input.triangleIndex as number) < 0) throw new Error(`flower[${index}] triangle index is invalid`);
    if (!Array.isArray(input.barycentric) || input.barycentric.length !== 3) throw new Error(`flower[${index}] barycentric coordinates are invalid`);
    const barycentric = input.barycentric.map((part, partIndex) => finiteNumber(part, `flower[${index}].barycentric[${partIndex}]`));
    const rotation = tuple4(input.rotation, `flower[${index}].rotation`);
    const rotationLength = Math.hypot(...rotation);
    if (Math.abs(rotationLength - 1) > 1e-6) throw new Error(`flower[${index}] rotation is not normalized`);
    const scale = finiteNumber(input.scale, `flower[${index}].scale`);
    if (!(scale > 0) || Math.abs(scale - recipe.flowerScale) > 1e-12) throw new Error(`flower[${index}] scale differs from its recipe`);
    return Object.freeze({
      id,
      triangleIndex: input.triangleIndex as number,
      barycentric: Object.freeze(barycentric) as unknown as readonly [number, number, number],
      position: tuple3(input.position, `flower[${index}].position`),
      normal: tuple3(input.normal, `flower[${index}].normal`),
      rotation,
      scale,
    });
  });
  return Object.freeze(flowers);
}

function parseBranchGraph(value: unknown): CompositionBranchGraph {
  const graph = object(value, "Composition branch graph");
  if (graph.recipe !== "inset-relay-mst-v0") throw new Error("Unknown branch graph recipe");
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("Branch graph nodes/edges are missing");
  const nodes = graph.nodes.map((entry, index) => {
    const input = object(entry, `branch node[${index}]`);
    if (input.role !== "back-anchor" && input.role !== "surface-anchor") throw new Error(`branch node[${index}] has an unknown role`);
    if (typeof input.id !== "string" || typeof input.flowerId !== "string") throw new Error(`branch node[${index}] has an invalid ID`);
    return Object.freeze({ id: input.id, flowerId: input.flowerId, role: input.role, position: tuple3(input.position, `branch node[${index}].position`) });
  });
  const edges = graph.edges.map((entry, index) => {
    const input = object(entry, `branch edge[${index}]`);
    if (input.role !== "relay" && input.role !== "attachment") throw new Error(`branch edge[${index}] has an unknown role`);
    if (typeof input.id !== "string" || typeof input.from !== "string" || typeof input.to !== "string") throw new Error(`branch edge[${index}] has an invalid reference`);
    return Object.freeze({ id: input.id, from: input.from, to: input.to, role: input.role });
  });
  return Object.freeze({
    recipe: "inset-relay-mst-v0",
    rootNodeId: String(graph.rootNodeId),
    insetMm: finiteNumber(graph.insetMm, "branches.insetMm"),
    diameterMm: finiteNumber(graph.diameterMm, "branches.diameterMm"),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
}

function decodeFloat32Base64(value: unknown, count: number, label: string): Float32Array {
  const bytes = base64ToBytes(value, label);
  if (bytes.byteLength !== count * 4) throw new Error(`${label} has an unexpected byte length`);
  const values = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < count; index += 1) {
    const number = view.getFloat32(index * 4, true);
    if (!Number.isFinite(number)) throw new Error(`${label} contains a non-finite coordinate`);
    values[index] = number;
  }
  return values;
}

function decodeUint32Base64(value: unknown, count: number, label: string): Uint32Array {
  const bytes = base64ToBytes(value, label);
  if (bytes.byteLength !== count * 4) throw new Error(`${label} has an unexpected byte length`);
  const values = new Uint32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < count; index += 1) values[index] = view.getUint32(index * 4, true);
  return values;
}

function sameNumbers(left: ArrayLike<number>, right: ArrayLike<number>, tolerance = 1e-6): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (Math.abs(left[index] - right[index]) > tolerance) return false;
  return true;
}

function rotatePositiveZ(rotation: Quaternion): Vec3 {
  const [x, y, z, w] = rotation;
  return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
}

function validateProjectAsset(value: unknown, expected: { fileName: string; sha256: string; byteLength: number }, label: string): Uint8Array {
  const input = object(value, label);
  if (input.fileName !== expected.fileName || input.sha256 !== expected.sha256 || input.byteLength !== expected.byteLength) {
    throw new Error(`${label} metadata differs from the locked source`);
  }
  const bytes = base64ToBytes(input.bytesBase64, `${label}.bytesBase64`);
  if (bytes.byteLength !== expected.byteLength) throw new Error(`${label} byte length does not match the lock`);
  return bytes;
}

export async function restoreCompositionProject(text: string): Promise<CompositionState> {
  if (typeof text !== "string" || text.length > 50_000_000) throw new Error("Composition package is empty or exceeds the v0 size limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Composition package is not valid JSON");
  }
  const project = object(parsed, "Composition package");
  if (project.schema !== COMPOSITION_PROJECT_SCHEMA) throw new Error("Unknown composition package schema");
  if (typeof project.snapshotSha256 !== "string" || !/^[0-9a-f]{64}$/.test(project.snapshotSha256)) throw new Error("Composition package snapshot hash is missing");
  const { snapshotSha256, ...unsigned } = project;
  if (await sha256Hex(canonicalCompositionJson(unsigned)) !== snapshotSha256) throw new Error("Composition package snapshot hash is invalid");

  const recipe = parseRecipe(project.recipe);
  const flowers = parseFlowers(project.flowers, recipe);
  const presentationRecord = object(project.presentation, "Composition presentation");
  if (typeof presentationRecord.showHost !== "boolean") throw new Error("Saved Host visibility must be boolean");
  const branches = parseBranchGraph(project.branches);
  const expectedGraph = buildCompositionBranches(flowers, recipe.branchDiameterMm, recipe.insetMm);
  if (canonicalCompositionJson(branches) !== canonicalCompositionJson(expectedGraph)) {
    throw new Error("Saved branch graph has invalid references, coordinates, diameter, or disconnected edges");
  }
  if (Math.abs(branches.diameterMm - recipe.branchDiameterMm) > 1e-12 || Math.abs(branches.insetMm - recipe.insetMm) > 1e-12) {
    throw new Error("Saved branch parameters do not match the recipe");
  }
  const status = object(project.status, "Composition status");
  if (status.role !== "permanent-structure-draft" || status.containment !== "UNVERIFIED" || status.fabrication !== "UNVERIFIED" || status.authorAccept !== false) {
    throw new Error("Composition package must retain its unverified draft status");
  }

  const hostRecord = object(project.host, "Composition host");
  const hostBytes = validateProjectAsset(hostRecord, LOCKED_HOST_INPUT, "Composition host");
  if (hostRecord.triangleCount !== LOCKED_HOST_INPUT.triangleCount) throw new Error("Saved Host triangle count differs from the locked input");
  const transform = object(hostRecord.sourceToScene, "Host sourceToScene");
  if (transform.units !== "mm" || transform.upAxis !== "z" || transform.handedness !== "right" || transform.scale !== 1
    || !sameNumbers(tuple4(transform.rotationXYZW, "Host rotation"), [0, 0, 0, 1], 0)
    || !sameNumbers(tuple3(transform.translation, "Host translation"), LOCKED_HOST_INPUT.translation, 1e-12)) {
    throw new Error("Saved Host source interpretation/transform differs from the locked policy");
  }
  const host = await loadCompositionHost(hostBytes, LOCKED_HOST_INPUT.fileName);

  const motifRecord = object(project.motif, "Composition motif");
  const sourceBytes = validateProjectAsset(motifRecord.source, LOCKED_MOTIF_INPUT, "Motif source");
  const frameBytes = validateProjectAsset(motifRecord.frame, {
    fileName: LOCKED_MOTIF_INPUT.frameFileName,
    sha256: LOCKED_MOTIF_INPUT.frameSha256,
    byteLength: LOCKED_MOTIF_INPUT.frameByteLength,
  }, "Motif frame");
  const motif = await loadMotifPrototype(sourceBytes, frameBytes);
  if (canonicalCompositionJson(motifRecord.frameRecord) !== canonicalCompositionJson(motif.frame)) throw new Error("Saved frame record differs from its original source bytes");
  const prototype = object(motifRecord.prototype, "Motif prototype");
  if (prototype.vertexCount !== motif.sourceVertexCount || prototype.faceCount !== motif.sourceFaceCount
    || !sameNumbers(tuple3(prototype.anchorLocal, "Motif anchor"), motif.anchorLocal, 0)) {
    throw new Error("Saved flower prototype counts or back-anchor differ from the locked motif");
  }
  const storedVertices = decodeFloat32Base64(prototype.verticesFloat32LEBase64, motif.vertices.length, "motif prototype vertices");
  const storedIndices = decodeUint32Base64(prototype.indicesUint32LEBase64, motif.indices.length, "motif prototype indices");
  if (!equalBytes(new Uint8Array(storedVertices.buffer), new Uint8Array(motif.vertices.buffer))
    || !equalBytes(new Uint8Array(storedIndices.buffer), new Uint8Array(motif.indices.buffer))) {
    throw new Error("Saved flower prototype does not match the locked NPZ/frame transform");
  }

  let prior: CompositionFlower[] = [];
  for (const flower of flowers) {
    if (flower.triangleIndex >= host.rawMesh.triangleCount || compareAnchorPosition(host, flower) > 1e-4) {
      throw new Error(`Saved flower ${flower.id} anchor does not match its Host triangle/barycentric data`);
    }
    const normal = [host.normals[flower.triangleIndex * 3], host.normals[flower.triangleIndex * 3 + 1], host.normals[flower.triangleIndex * 3 + 2]];
    if (!sameNumbers(flower.normal, normal, 1e-6) || !sameNumbers(rotatePositiveZ(flower.rotation), normal, 1e-6)) {
      throw new Error(`Saved flower ${flower.id} orientation differs from its Host winding normal`);
    }
    for (const other of prior) {
      const distance = Math.hypot(flower.position[0] - other.position[0], flower.position[1] - other.position[1], flower.position[2] - other.position[2]);
      if (distance < recipe.minAnchorSpacingMm - 1e-4) throw new Error("Saved flower anchors violate minimum spacing");
    }
    prior.push(flower);
  }
  const state: CompositionState = Object.freeze({
    host,
    motif,
    recipe,
    flowers,
    branches,
    presentation: Object.freeze({ showHost: presentationRecord.showHost }),
  });
  assertCompositionContinuity(state);
  return state;
}
