import { sha256Hex } from "../../lib/hash.ts";

/** The small filesystem surface used by the browser-native retention gate. */
export interface CandidateArtifactDirectoryHandle {
  readonly name?: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<CandidateArtifactFileHandle>;
}

export interface CandidateArtifactFileHandle {
  createWritable(): Promise<CandidateArtifactWritableFile>;
  getFile(): Promise<CandidateArtifactReadableFile>;
}

export interface CandidateArtifactWritableFile {
  write(data: ArrayBuffer | string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface CandidateArtifactReadableFile {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface CandidateArtifactEvidenceBase {
  readonly schema: "katachi.skin.astra.candidate-artifact-retention.v0";
  readonly version: 0;
  readonly candidate: Record<string, unknown>;
  readonly rabbit: Record<string, unknown>;
  readonly supportSettings: Record<string, unknown>;
  readonly placement: Record<string, unknown> | null;
  readonly canonicalization: string;
  readonly runtime: Record<string, unknown>;
}

export interface CandidateArtifactRetentionFacts {
  readonly archiveFilename: string;
  readonly evidenceFilename: string;
  readonly validator: "PASS";
  readonly generatedArchiveByteLength: number;
  readonly persistedArchiveByteLength: number;
  readonly generatedArchiveSha256: string;
  readonly persistedArchiveSha256: string;
  readonly exactByteLengthMatch: true;
  readonly exactByteMatch: true;
  readonly exactSha256Match: true;
  readonly durableVerification: "PASS";
}

export interface PersistCandidateArtifactInput {
  readonly directory: CandidateArtifactDirectoryHandle;
  readonly archive: ArrayBuffer;
  readonly archiveFilename: string;
  readonly evidence: CandidateArtifactEvidenceBase;
}

export interface PersistCandidateArtifactResult {
  readonly retention: CandidateArtifactRetentionFacts;
  readonly evidenceText: string;
}

function validateFilename(filename: string, label: string): void {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename === "." || filename === "..") {
    throw new Error(`Fail closed: ${label} must be a single deterministic filename`);
  }
}

async function writeAndClose(handle: CandidateArtifactFileHandle, data: ArrayBuffer | string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    try { await writable.abort?.(); } catch { /* preserve the original write/close failure */ }
    throw error;
  }
}

async function readBytes(handle: CandidateArtifactFileHandle): Promise<ArrayBuffer> {
  return (await handle.getFile()).arrayBuffer();
}

function exactBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Persist the already-validated archive and gate success on a real read-back.
 * The sidecar is written only after archive bytes and SHA-256 both match.
 */
export async function persistCandidateArtifact(
  input: PersistCandidateArtifactInput,
): Promise<PersistCandidateArtifactResult> {
  validateFilename(input.archiveFilename, "archive filename");
  if (!(input.archive.byteLength > 0)) throw new Error("Fail closed: validated archive is empty");
  if (input.evidence.schema !== "katachi.skin.astra.candidate-artifact-retention.v0" || input.evidence.version !== 0) {
    throw new Error("Fail closed: candidate retention evidence schema is invalid");
  }

  const generatedArchiveSha256 = await sha256Hex(input.archive);
  const archiveHandle = await input.directory.getFileHandle(input.archiveFilename, { create: true });
  await writeAndClose(archiveHandle, input.archive);
  const reopenedArchiveHandle = await input.directory.getFileHandle(input.archiveFilename);
  const persistedArchive = await readBytes(reopenedArchiveHandle);
  const persistedArchiveSha256 = await sha256Hex(persistedArchive);
  const exactByteLengthMatch = persistedArchive.byteLength === input.archive.byteLength;
  const exactByteMatch = exactByteLengthMatch && exactBytes(input.archive, persistedArchive);
  const exactSha256Match = persistedArchiveSha256 === generatedArchiveSha256;
  if (!exactByteLengthMatch || !exactByteMatch || !exactSha256Match) {
    throw new Error(
      `Fail closed: persisted archive mismatch (bytes ${persistedArchive.byteLength}/${input.archive.byteLength}, `
      + `SHA ${persistedArchiveSha256}/${generatedArchiveSha256})`,
    );
  }

  const evidenceFilename = input.archiveFilename.replace(/\.3mf$/i, ".evidence.json");
  validateFilename(evidenceFilename, "evidence filename");
  const retention: CandidateArtifactRetentionFacts = {
    archiveFilename: input.archiveFilename,
    evidenceFilename,
    validator: "PASS",
    generatedArchiveByteLength: input.archive.byteLength,
    persistedArchiveByteLength: persistedArchive.byteLength,
    generatedArchiveSha256,
    persistedArchiveSha256,
    exactByteLengthMatch: true,
    exactByteMatch: true,
    exactSha256Match: true,
    durableVerification: "PASS",
  };
  const evidenceText = JSON.stringify({ ...input.evidence, retention }, null, 2);
  const evidenceHandle = await input.directory.getFileHandle(evidenceFilename, { create: true });
  await writeAndClose(evidenceHandle, evidenceText);
  const reopenedEvidenceHandle = await input.directory.getFileHandle(evidenceFilename);
  const persistedEvidenceText = new TextDecoder().decode(await readBytes(reopenedEvidenceHandle));
  if (persistedEvidenceText !== evidenceText) throw new Error("Fail closed: persisted evidence sidecar mismatch");
  return { retention, evidenceText };
}
