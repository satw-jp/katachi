export interface Stage6MeshBoundsMm {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}

export interface Stage6MeshComponentDiagnostic {
  id: number;
  triangleCount: number;
  volumeMm3: number;
  signedVolumeMm3: number;
  boundsMm: Stage6MeshBoundsMm;
}

export interface Stage6MeshTopologyDiagnostics {
  triangleCount: number;
  componentCount: number;
  components: Stage6MeshComponentDiagnostic[];
  faceComponentIds: Int32Array;
  degenerateFaceIndices: Int32Array;
  scaleMmPerUnit: number;
  plateShiftSourceZ: number;
}

const vertexKey = (x: number, y: number, z: number): string =>
  `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;

const savedPoint = (
  positions: Float32Array,
  offset: number,
  scaleMmPerUnit: number,
  plateShiftSourceZ: number,
): [number, number, number] => [
  Math.fround(positions[offset] * scaleMmPerUnit),
  Math.fround(positions[offset + 1] * scaleMmPerUnit),
  Math.fround((positions[offset + 2] + plateShiftSourceZ) * scaleMmPerUnit),
];

const savedTriangleIsDegenerate = (
  saved: readonly [[number, number, number], [number, number, number], [number, number, number]],
): boolean => {
  const repeated = (saved[0][0] === saved[1][0] && saved[0][1] === saved[1][1] && saved[0][2] === saved[1][2])
    || (saved[0][0] === saved[2][0] && saved[0][1] === saved[2][1] && saved[0][2] === saved[2][2])
    || (saved[1][0] === saved[2][0] && saved[1][1] === saved[2][1] && saved[1][2] === saved[2][2]);
  const abx = saved[1][0] - saved[0][0];
  const aby = saved[1][1] - saved[0][1];
  const abz = saved[1][2] - saved[0][2];
  const acx = saved[2][0] - saved[0][0];
  const acy = saved[2][1] - saved[0][1];
  const acz = saved[2][2] - saved[0][2];
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;
  return repeated || (crossX === 0 && crossY === 0 && crossZ === 0);
};

function gateDegenerateFaceIndices(
  positions: Float32Array,
  scaleMmPerUnit: number,
): Int32Array {
  const triangleCount = positions.length / 9;
  const partition = (faceIds: readonly number[], keyAt: (offset: number) => string): Map<number, number[]> => {
    const parent = Int32Array.from({ length: faceIds.length }, (_, index) => index);
    const find = (value: number): number => {
      let root = value;
      while (parent[root] !== root) root = parent[root];
      while (parent[value] !== value) {
        const next = parent[value]; parent[value] = root; value = next;
      }
      return root;
    };
    const firstByVertex = new Map<string, number>();
    for (let local = 0; local < faceIds.length; local += 1) {
      const base = faceIds[local] * 9;
      for (let corner = 0; corner < 3; corner += 1) {
        const key = keyAt(base + corner * 3);
        const first = firstByVertex.get(key);
        if (first === undefined) firstByVertex.set(key, local);
        else {
          const rootA = find(local); const rootB = find(first);
          if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
        }
      }
    }
    const groups = new Map<number, number[]>();
    for (let local = 0; local < faceIds.length; local += 1) {
      const root = find(local);
      const group = groups.get(root) ?? [];
      group.push(faceIds[local]);
      groups.set(root, group);
    }
    return groups;
  };
  let surviving = Array.from({ length: triangleCount }, (_, face) => face);

  // Match removeClosedNegativeVolumeCavities: exact unshifted saved identity,
  // then discard closed components whose signed volume opposes the main one.
  const savedGroups = partition(surviving, (offset) => {
    const point = savedPoint(positions, offset, scaleMmPerUnit, 0);
    return `${point[0]},${point[1]},${point[2]}`;
  });
  if (savedGroups.size > 1) {
    const volumeByRoot = [...savedGroups.entries()].map(([root, faceIds]) => {
      let signedSixVolume = 0;
      for (const face of faceIds) {
        const base = face * 9;
        const ax = positions[base]; const ay = positions[base + 1]; const az = positions[base + 2];
        const bx = positions[base + 3]; const by = positions[base + 4]; const bz = positions[base + 5];
        const cx = positions[base + 6]; const cy = positions[base + 7]; const cz = positions[base + 8];
        signedSixVolume += ax * (by * cz - bz * cy)
          - ay * (bx * cz - bz * cx)
          + az * (bx * cy - by * cx);
      }
      return { root, signedSixVolume };
    });
    const main = [...volumeByRoot].sort((a, b) => Math.abs(b.signedSixVolume) - Math.abs(a.signedSixVolume))[0];
    const mainSign = Math.sign(main.signedSixVolume);
    if (mainSign !== 0) {
      const cavityRoots = new Set(volumeByRoot
        .filter((item) => Math.sign(item.signedSixVolume) !== 0 && Math.sign(item.signedSixVolume) !== mainSign)
        .map((item) => item.root));
      if (cavityRoots.size > 0) {
        const cavityFaces = new Set([...cavityRoots].flatMap((root) => savedGroups.get(root) ?? []));
        surviving = surviving.filter((face) => !cavityFaces.has(face));
      }
    }
  }

  const degenerate = new Set<number>();
  const removeDegenerateAtShift = (plateShiftSourceZ: number): void => {
    surviving = surviving.filter((face) => {
      const base = face * 9;
      const saved = [
        savedPoint(positions, base, scaleMmPerUnit, plateShiftSourceZ),
        savedPoint(positions, base + 3, scaleMmPerUnit, plateShiftSourceZ),
        savedPoint(positions, base + 6, scaleMmPerUnit, plateShiftSourceZ),
      ] as const;
      if (!savedTriangleIsDegenerate(saved)) return true;
      degenerate.add(face);
      return false;
    });
  };
  removeDegenerateAtShift(0);

  // Match the bounded tiny-island pass between the two saved-coordinate
  // filters. Preserve ids only for diagnosis; no face is changed here.
  const sourceGroups = partition(surviving, (offset) =>
    `${Math.round(positions[offset] * 1e8)},${Math.round(positions[offset + 1] * 1e8)},${Math.round(positions[offset + 2] * 1e8)}`);
  if (sourceGroups.size > 1) {
    const ordered = [...sourceGroups.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
    const removedCount = surviving.length - ordered[0].length;
    const repairLimit = Math.max(128, Math.floor(surviving.length * 0.0025));
    if (removedCount <= repairLimit) surviving = ordered[0];
  }
  let survivingMinZ = Infinity;
  for (const face of surviving) {
    const base = face * 9;
    survivingMinZ = Math.min(survivingMinZ, positions[base + 2], positions[base + 5], positions[base + 8]);
  }
  removeDegenerateAtShift(Number.isFinite(survivingMinZ) ? -survivingMinZ : 0);
  return Int32Array.from([...degenerate].sort((a, b) => a - b));
}

/**
 * Analysis-only Stage 6 topology evidence. Components intentionally match the
 * raw triangle soup shown by Stage 6; degenerate faces are detected after the
 * exact Float32 scale/plate translation used by saved mesh coordinates. No
 * triangle is removed, moved, repaired, or otherwise mutated here.
 */
export function analyzeStage6MeshTopology(
  positions: Float32Array,
  targetLongestMm: number,
): Stage6MeshTopologyDiagnostics {
  if (positions.length % 9 !== 0) throw new Error("Stage 6 positions must contain complete triangles");
  const triangleCount = positions.length / 9;
  if (triangleCount === 0) {
    return {
      triangleCount: 0,
      componentCount: 0,
      components: [],
      faceComponentIds: new Int32Array(0),
      degenerateFaceIndices: new Int32Array(0),
      scaleMmPerUnit: 1,
      plateShiftSourceZ: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const longestSource = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const scaleMmPerUnit = longestSource > 0 && targetLongestMm > 0 ? targetLongestMm / longestSource : 1;
  const plateShiftSourceZ = -minZ;

  const parent = new Int32Array(triangleCount);
  const rank = new Uint8Array(triangleCount);
  for (let i = 0; i < triangleCount; i += 1) parent[i] = i;
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  const unite = (a: number, b: number): void => {
    let rootA = find(a);
    let rootB = find(b);
    if (rootA === rootB) return;
    if (rank[rootA] < rank[rootB]) [rootA, rootB] = [rootB, rootA];
    parent[rootB] = rootA;
    if (rank[rootA] === rank[rootB]) rank[rootA] += 1;
  };
  const firstFaceByVertex = new Map<string, number>();
  for (let face = 0; face < triangleCount; face += 1) {
    const base = face * 9;
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = base + corner * 3;
      const key = vertexKey(positions[offset], positions[offset + 1], positions[offset + 2]);
      const first = firstFaceByVertex.get(key);
      if (first === undefined) firstFaceByVertex.set(key, face);
      else unite(face, first);
    }
  }

  type ComponentAccum = {
    root: number;
    faceIds: number[];
    signedSixVolumeSource: number;
    min: [number, number, number];
    max: [number, number, number];
  };
  const accumByRoot = new Map<number, ComponentAccum>();
  for (let face = 0; face < triangleCount; face += 1) {
    const root = find(face);
    let accum = accumByRoot.get(root);
    if (!accum) {
      accum = {
        root,
        faceIds: [],
        signedSixVolumeSource: 0,
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      accumByRoot.set(root, accum);
    }
    accum.faceIds.push(face);
    const base = face * 9;
    const ax = positions[base]; const ay = positions[base + 1]; const az = positions[base + 2];
    const bx = positions[base + 3]; const by = positions[base + 4]; const bz = positions[base + 5];
    const cx = positions[base + 6]; const cy = positions[base + 7]; const cz = positions[base + 8];
    accum.signedSixVolumeSource += ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx);
    const saved = [
      savedPoint(positions, base, scaleMmPerUnit, plateShiftSourceZ),
      savedPoint(positions, base + 3, scaleMmPerUnit, plateShiftSourceZ),
      savedPoint(positions, base + 6, scaleMmPerUnit, plateShiftSourceZ),
    ] as const;
    for (const point of saved) {
      for (let axis = 0; axis < 3; axis += 1) {
        accum.min[axis] = Math.min(accum.min[axis], point[axis]);
        accum.max[axis] = Math.max(accum.max[axis], point[axis]);
      }
    }
  }

  const ordered = [...accumByRoot.values()].sort((a, b) =>
    b.faceIds.length - a.faceIds.length || a.root - b.root);
  const faceComponentIds = new Int32Array(triangleCount);
  const scale3 = scaleMmPerUnit ** 3;
  const components = ordered.map((accum, id): Stage6MeshComponentDiagnostic => {
    for (const face of accum.faceIds) faceComponentIds[face] = id;
    const signedVolumeMm3 = accum.signedSixVolumeSource * scale3 / 6;
    return {
      id,
      triangleCount: accum.faceIds.length,
      volumeMm3: Math.abs(signedVolumeMm3),
      signedVolumeMm3,
      boundsMm: {
        min: accum.min,
        max: accum.max,
        size: [
          accum.max[0] - accum.min[0],
          accum.max[1] - accum.min[1],
          accum.max[2] - accum.min[2],
        ],
      },
    };
  });

  return {
    triangleCount,
    componentCount: components.length,
    components,
    faceComponentIds,
    degenerateFaceIndices: gateDegenerateFaceIndices(positions, scaleMmPerUnit),
    scaleMmPerUnit,
    plateShiftSourceZ,
  };
}
