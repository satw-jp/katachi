import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { FKEI_SCHEMA, captureFkei, parseFkeiDocument, serializeFkei } from "./fkei.ts";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type HostSourceInterpretation,
} from "./externalStlHost.ts";
import {
  applyApprovedBoundaryRepair,
  APPROVED_USAGI_BOUNDARY_LOOPS,
  USAGI_REPAIR_POLICY_VERSION,
  USAGI_SOURCE_SHA256,
} from "./externalStlHostRepair.ts";
import { createExternalStlHostV6Adapter } from "./externalStlHostV6Adapter.ts";
import { generateAuthorGateMotifs } from "./externalStlHostAuthorGate.ts";
import {
  captureExternalHostProject,
  EXTERNAL_HOST_FKEI_SCHEMA,
  hydrateExternalHostProject,
  parseExternalHostProject,
  restoreExternalHostProjectAtomically,
  serializeExternalHostProject,
} from "./externalStlHostPersistence.ts";

const RABBIT_PATH = "C:/dev/samples/rabbit_230223.stl";
const interpretation: HostSourceInterpretation = {
  unitStatus: "explicit",
  mmPerSourceUnit: 1,
  upAxis: "y",
  handedness: "right",
  importPolicyVersion: "stl-host-v0",
};

const transform = {
  translation: { x: 0, y: 0, z: 0 },
  rotation: [0, 0, 0, 1] as const,
  uniformScale: 20,
};

async function expectReject(task: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await task();
  } catch (error) {
    assert.match(String(error), pattern);
    return;
  }
  assert.equal(true, false, `expected rejection matching ${pattern}`);
}

test("External Host v2 embeds the exact rabbit source and restores authored motifs without regeneration", async () => {
  if (!existsSync(RABBIT_PATH)) return;
  const sourceBytes = readFileSync(RABBIT_PATH);
  const source = await createImportedHostSource(sourceBytes, { filename: "rabbit_230223.stl", interpretation });
  assert.equal(source.sourceIdentity.sha256, USAGI_SOURCE_SHA256);
  const original = createImportedHostInstance(source, transform);
  const repaired = await applyApprovedBoundaryRepair(original, {
    originalSourceSha256: USAGI_SOURCE_SHA256,
    repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION,
    approvedBoundaryLoopIndices: APPROVED_USAGI_BOUNDARY_LOOPS,
  });
  const adapter = createExternalStlHostV6Adapter(repaired.repaired, { seed: "usagi-v6-golden" });
  const motifSettings = { sizeMode: "varied" as const, baseSize: 2.4, sizeVariance: 0.35 };
  const motifs = generateAuthorGateMotifs(adapter, 32, { ...motifSettings, minimumClearance: 4.6 });
  const document = captureExternalHostProject({ source, original, repaired, motifs, hostVisible: true, seed: "usagi-v6-golden", motifSettings, savedAt: "2026-09-05T00:00:00.000Z" });
  assert.equal(document.schema, EXTERNAL_HOST_FKEI_SCHEMA);
  assert.equal(document.referenceHost.printable, false);
  assert.equal(Object.prototype.hasOwnProperty.call(document.authoredMotifs[0], "printable"), false);
  const serialized = serializeExternalHostProject(document);
  assert.match(serialized, /"kind": "array-buffer"/);
  const parsed = parseExternalHostProject(serialized);
  assert.deepEqual(parsed.motifGeneration.count, 32);
  assert.equal(parsed.motifGeneration.sizeMode, "varied");
  assert.equal(parsed.motifGeneration.baseSize, 2.4);
  assert.equal(parsed.motifGeneration.sizeVariance, 0.35);
  assert.equal(parsed.referenceHost.source.bytes.byteLength, sourceBytes.byteLength);
  assert.deepEqual(Array.from(new Uint8Array(parsed.referenceHost.source.bytes)), Array.from(sourceBytes));
  const restored = await hydrateExternalHostProject(serialized);
  assert.equal(restored.sourcePathRequired, false);
  assert.equal(restored.source.sourceIdentity.sha256, USAGI_SOURCE_SHA256);
  assert.equal(restored.repaired.materialization.repairedFingerprint, repaired.materialization.repairedFingerprint);
  assert.equal(restored.repaired.repaired.capabilities.signedVolumeCapability.availability, "AVAILABLE");
  assert.deepEqual(restored.motifs, motifs);
  assert.equal(restored.motifs.length, 32);
  assert.ok(restored.repaired.repaired.signedVolumeQuery);
  const bounds = repaired.repaired.mesh.bounds;
  const transformedProbe = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const originalSurface = original.query.closestSurface(transformedProbe);
  const restoredSurface = restored.original.query.closestSurface(transformedProbe);
  assert.ok(originalSurface && restoredSurface);
  assert.deepEqual(restoredSurface, originalSurface);
  assert.equal(restored.repaired.repaired.signedVolumeQuery!.insideOutside(transformedProbe), repaired.repaired.signedVolumeQuery!.insideOutside(transformedProbe));
  assert.equal(restored.repaired.repaired.signedVolumeQuery!.signedDistance(transformedProbe), repaired.repaired.signedVolumeQuery!.signedDistance(transformedProbe));
});

test("External Host v2 fails closed on source hash and repaired fingerprint tampering", async () => {
  if (!existsSync(RABBIT_PATH)) return;
  const source = await createImportedHostSource(readFileSync(RABBIT_PATH), { filename: "rabbit_230223.stl", interpretation });
  const original = createImportedHostInstance(source, transform);
  const repaired = await applyApprovedBoundaryRepair(original, {
    originalSourceSha256: USAGI_SOURCE_SHA256,
    repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION,
    approvedBoundaryLoopIndices: APPROVED_USAGI_BOUNDARY_LOOPS,
  });
  const adapter = createExternalStlHostV6Adapter(repaired.repaired, { seed: "tamper" });
  const document = captureExternalHostProject({ source, original, repaired, motifs: adapter.placeFlowers(1, undefined, 1), hostVisible: true, seed: "tamper" });
  const sourceTampered = JSON.parse(serializeExternalHostProject(document)) as Record<string, unknown>;
  const sourceRecord = sourceTampered.referenceHost as Record<string, unknown>;
  const sourceIdentity = sourceRecord.source as Record<string, unknown>;
  sourceIdentity.sha256 = "0".repeat(64);
  await expectReject(() => hydrateExternalHostProject(parseExternalHostProject(JSON.stringify(sourceTampered))), /source hash/);
  const fingerprintTampered = JSON.parse(serializeExternalHostProject(document)) as Record<string, unknown>;
  const fingerprintRecord = fingerprintTampered.referenceHost as Record<string, unknown>;
  const repairRecord = fingerprintRecord.repair as Record<string, unknown>;
  repairRecord.expectedRepairedMeshFingerprint = "1".repeat(64);
  await expectReject(() => hydrateExternalHostProject(parseExternalHostProject(JSON.stringify(fingerprintTampered))), /fingerprint/);
});

test("External Host v2 hydration is atomic and leaves the previous live project unchanged on failure", async () => {
  if (!existsSync(RABBIT_PATH)) return;
  const source = await createImportedHostSource(readFileSync(RABBIT_PATH), { filename: "rabbit_230223.stl", interpretation });
  const original = createImportedHostInstance(source, transform);
  const repaired = await applyApprovedBoundaryRepair(original, {
    originalSourceSha256: USAGI_SOURCE_SHA256,
    repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION,
    approvedBoundaryLoopIndices: APPROVED_USAGI_BOUNDARY_LOOPS,
  });
  const adapter = createExternalStlHostV6Adapter(repaired.repaired, { seed: "atomic" });
  const document = captureExternalHostProject({ source, original, repaired, motifs: adapter.placeFlowers(1, undefined, 1), hostVisible: true, seed: "atomic" });
  const serialized = serializeExternalHostProject(document);
  const live = { marker: "previous", replaceCount: 0, restoreCount: 0 };
  const tampered = parseExternalHostProject(serialized);
  const tamperedDocument = {
    ...tampered,
    referenceHost: { ...tampered.referenceHost, repair: { ...tampered.referenceHost.repair, expectedRepairedMeshFingerprint: "2".repeat(64) } },
  };
  await expectReject(() => restoreExternalHostProjectAtomically(tamperedDocument, {
    capture: () => ({ marker: live.marker }),
    replace: () => { live.replaceCount += 1; live.marker = "changed"; },
    restore: (snapshot) => { live.restoreCount += 1; live.marker = snapshot.marker; },
    redraw: () => undefined,
  }), /fingerprint/);
  assert.deepEqual(live, { marker: "previous", replaceCount: 0, restoreCount: 0 });
});

test("existing FKEI v1 remains the same schema and serialization path", () => {
  const legacy = captureFkei({
    shape: { formatVersion: 1, entries: [{ t: 1, op: "clearAll", args: {} }] },
    bindings: { shapeFingerprint: "v1-fixture", patchSetRevision: 1, paintRevision: 0 },
    completedStage: 1,
  });
  assert.equal(legacy.schema, FKEI_SCHEMA);
  const serialized = serializeFkei(legacy);
  const restored = parseFkeiDocument(serialized);
  assert.equal(restored.schema, FKEI_SCHEMA);
  assert.equal(serializeFkei(restored), serialized);
});
