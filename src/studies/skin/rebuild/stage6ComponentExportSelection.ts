export interface Stage6ComponentExportSelection {
  componentIds: number[];
  triangleCount: number;
  positions: Float32Array;
  normals: Float32Array;
}

/**
 * Copy only explicitly kept Stage 6 components into an export-only triangle
 * buffer. The source positions, normals, diagnostics, and FKEI geometry are
 * never mutated.
 */
export function buildStage6ComponentExportSelection(
  positions: Float32Array,
  normals: Float32Array,
  faceComponentIds: Int32Array,
  keptComponentIds: ReadonlySet<number>,
): Stage6ComponentExportSelection {
  if (positions.length % 9 !== 0) throw new Error("Stage 6 component selection requires complete triangles");
  if (normals.length !== positions.length) throw new Error("Stage 6 component selection requires matching normals");
  const faceCount = positions.length / 9;
  if (faceComponentIds.length !== faceCount) throw new Error("Stage 6 component ids do not match the triangle buffer");
  const available = new Set<number>();
  let selectedFaceCount = 0;
  for (let face = 0; face < faceCount; face += 1) {
    const componentId = faceComponentIds[face];
    available.add(componentId);
    if (keptComponentIds.has(componentId)) selectedFaceCount += 1;
  }
  const componentIds = [...keptComponentIds]
    .filter((componentId) => available.has(componentId))
    .sort((a, b) => a - b);
  if (componentIds.length === 0 || selectedFaceCount === 0) {
    throw new Error("Export Component Selection requires at least one kept component");
  }
  const selectedPositions = new Float32Array(selectedFaceCount * 9);
  const selectedNormals = new Float32Array(selectedFaceCount * 9);
  let selectedFace = 0;
  for (let face = 0; face < faceCount; face += 1) {
    if (!keptComponentIds.has(faceComponentIds[face])) continue;
    const sourceOffset = face * 9;
    const outputOffset = selectedFace * 9;
    selectedPositions.set(positions.subarray(sourceOffset, sourceOffset + 9), outputOffset);
    selectedNormals.set(normals.subarray(sourceOffset, sourceOffset + 9), outputOffset);
    selectedFace += 1;
  }
  return {
    componentIds,
    triangleCount: selectedFaceCount,
    positions: selectedPositions,
    normals: selectedNormals,
  };
}

export function stage6ComponentSelectionTriangleCount(
  faceComponentIds: Int32Array,
  keptComponentIds: ReadonlySet<number>,
): number {
  let selectedFaceCount = 0;
  for (const componentId of faceComponentIds) {
    if (keptComponentIds.has(componentId)) selectedFaceCount += 1;
  }
  return selectedFaceCount;
}
