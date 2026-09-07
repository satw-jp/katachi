import assert from "node:assert/strict";
import {
  persistCandidateArtifact,
  type CandidateArtifactDirectoryHandle,
  type CandidateArtifactFileHandle,
  type CandidateArtifactReadableFile,
  type CandidateArtifactWritableFile,
} from "./candidateArtifactRetention.ts";

class MemoryWritable implements CandidateArtifactWritableFile {
  private pending: Uint8Array<ArrayBuffer> | null = null;
  private readonly owner: MemoryFile;
  aborted = false;

  constructor(owner: MemoryFile) { this.owner = owner; }

  async write(data: ArrayBuffer | string): Promise<void> {
    if (typeof data === "string") {
      this.pending = new TextEncoder().encode(data);
      return;
    }
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(new Uint8Array(data));
    this.pending = bytes;
  }

  async close(): Promise<void> {
    if (!this.pending) throw new Error("nothing written");
    this.owner.bytes = this.pending;
  }

  async abort(): Promise<void> { this.aborted = true; }
}

class MemoryFile implements CandidateArtifactFileHandle {
  bytes: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  async createWritable(): Promise<CandidateArtifactWritableFile> { return new MemoryWritable(this); }

  async getFile(): Promise<CandidateArtifactReadableFile> {
    const snapshot = new Uint8Array(this.bytes.byteLength);
    snapshot.set(this.bytes);
    return { arrayBuffer: async () => snapshot.buffer.slice(snapshot.byteOffset, snapshot.byteOffset + snapshot.byteLength) };
  }
}

class MemoryDirectory implements CandidateArtifactDirectoryHandle {
  readonly name = "retention-test";
  readonly files = new Map<string, MemoryFile>();
  corruptArchiveReadback = false;

  async getFileHandle(name: string): Promise<CandidateArtifactFileHandle> {
    const existing = this.files.get(name) ?? new MemoryFile();
    this.files.set(name, existing);
    if (name.endsWith(".3mf") && this.corruptArchiveReadback) {
      return {
        createWritable: () => existing.createWritable(),
        getFile: async () => ({
          arrayBuffer: async () => {
            const corrupted = existing.bytes.slice();
            corrupted[0] = (corrupted[0] ?? 0) ^ 0xff;
            return corrupted.buffer.slice(corrupted.byteOffset, corrupted.byteOffset + corrupted.byteLength);
          },
        }),
      };
    }
    return existing;
  }
}

const evidence = {
  schema: "katachi.skin.astra.candidate-artifact-retention.v0" as const,
  version: 0 as const,
  candidate: { id: "A", sourceFilename: "A2_BODY.stl", sourceSha256: "candidate-sha", geometryFingerprint: "geometry-sha" },
  rabbit: { sourceSha256: "rabbit-sha", repairFingerprint: "repair-sha", transform: "1 mm/source-unit · +Y · right-handed · uniformScale 20" },
  supportSettings: { overhangThresholdDeg: 45, shaftDiameterMm: 1.6, neckDiameterMm: 0.6, removalGapMm: 0.35 },
  placement: { translationMm: { x: 0, y: 0, z: 48.029293060302734 } },
  canonicalization: "astra-candidate-print-space-f32-le-v0",
  runtime: { browser: "test" },
};

const archive = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03, 0x04]).buffer;
const directory = new MemoryDirectory();
const result = await persistCandidateArtifact({
  directory,
  archive,
  archiveFilename: "ASTRA_A_candidate-print-lane.3mf",
  evidence,
});
assert.equal(result.retention.validator, "PASS");
assert.equal(result.retention.durableVerification, "PASS");
assert.equal(result.retention.exactByteLengthMatch, true);
assert.equal(result.retention.exactByteMatch, true);
assert.equal(result.retention.exactSha256Match, true);
assert.equal(result.retention.archiveFilename, "ASTRA_A_candidate-print-lane.3mf");
assert.equal(result.retention.evidenceFilename, "ASTRA_A_candidate-print-lane.evidence.json");
assert.deepEqual([...directory.files.get(result.retention.archiveFilename)!.bytes], [...new Uint8Array(archive)]);
const sidecar = JSON.parse(new TextDecoder().decode(directory.files.get(result.retention.evidenceFilename)!.bytes)) as typeof evidence & { retention: typeof result.retention; candidate: { export?: { archive?: unknown } } };
assert.deepEqual(sidecar.retention, result.retention);
assert.equal(sidecar.candidate.export?.archive, undefined, "sidecar must exclude binary archive bytes");

const mismatchDirectory = new MemoryDirectory();
mismatchDirectory.corruptArchiveReadback = true;
let mismatchFailed = false;
try {
  await persistCandidateArtifact({ directory: mismatchDirectory, archive, archiveFilename: "ASTRA_A_candidate-print-lane.3mf", evidence });
} catch (error) {
  mismatchFailed = true;
  assert.match(String(error), /persisted archive mismatch/);
}
assert.equal(mismatchFailed, true, "mismatch must fail closed");
assert.equal(mismatchDirectory.files.has("ASTRA_A_candidate-print-lane.evidence.json"), false, "mismatch must fail before sidecar/release");

console.log("candidateArtifactRetention: durable write/close/reopen/bytes/SHA, sidecar identity, and fail-closed mismatch passed");
