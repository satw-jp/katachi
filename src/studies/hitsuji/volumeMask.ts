import * as THREE from "three";

export interface VolumeMask {
  inside: Uint8Array;
  distanceToSurface: Uint8Array;
}

function gridCoordinate(index: number, size: number, extent: number): number {
  return (index / (size - 1) - 0.5) * extent * 2;
}

function gridIndexForCoordinate(value: number, size: number, extent: number): number {
  return (value / (extent * 2) + 0.5) * (size - 1);
}

export function createVolumeMask(
  geometry: THREE.BufferGeometry,
  size: number,
  extent = 1.06,
): VolumeMask {
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const sourceIndex = geometry.getIndex();
  const triangleCount = sourceIndex ? sourceIndex.count / 3 : positions.count / 3;
  const intersections = Array.from({ length: size * size }, () => [] as number[]);
  const at = (corner: number) => (sourceIndex ? sourceIndex.getX(corner) : corner);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    a.fromBufferAttribute(positions, at(triangle * 3));
    b.fromBufferAttribute(positions, at(triangle * 3 + 1));
    c.fromBufferAttribute(positions, at(triangle * 3 + 2));
    const denominator = (b.z - c.z) * (a.y - c.y) + (c.y - b.y) * (a.z - c.z);
    if (Math.abs(denominator) < 1e-10) continue;

    const minY = THREE.MathUtils.clamp(
      Math.ceil(gridIndexForCoordinate(Math.min(a.y, b.y, c.y), size, extent)),
      0,
      size - 1,
    );
    const maxY = THREE.MathUtils.clamp(
      Math.floor(gridIndexForCoordinate(Math.max(a.y, b.y, c.y), size, extent)),
      0,
      size - 1,
    );
    const minZ = THREE.MathUtils.clamp(
      Math.ceil(gridIndexForCoordinate(Math.min(a.z, b.z, c.z), size, extent)),
      0,
      size - 1,
    );
    const maxZ = THREE.MathUtils.clamp(
      Math.floor(gridIndexForCoordinate(Math.max(a.z, b.z, c.z), size, extent)),
      0,
      size - 1,
    );

    for (let zIndex = minZ; zIndex <= maxZ; zIndex++) {
      const z = gridCoordinate(zIndex, size, extent);
      for (let yIndex = minY; yIndex <= maxY; yIndex++) {
        const y = gridCoordinate(yIndex, size, extent);
        const weightA =
          ((b.z - c.z) * (y - c.y) + (c.y - b.y) * (z - c.z)) / denominator;
        const weightB =
          ((c.z - a.z) * (y - c.y) + (a.y - c.y) * (z - c.z)) / denominator;
        const weightC = 1 - weightA - weightB;
        const epsilon = 1e-7;
        if (weightA < -epsilon || weightB < -epsilon || weightC < -epsilon) continue;
        const x = weightA * a.x + weightB * b.x + weightC * c.x;
        intersections[yIndex + size * zIndex].push(x);
      }
    }
  }

  const inside = new Uint8Array(size ** 3);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      const crossings = intersections[y + size * z].sort((left, right) => left - right);
      const unique: number[] = [];
      for (const crossing of crossings) {
        if (unique.length === 0 || Math.abs(crossing - unique[unique.length - 1]) > 1e-5) {
          unique.push(crossing);
        }
      }
      let crossingIndex = 0;
      for (let x = 0; x < size; x++) {
        const coordinate = gridCoordinate(x, size, extent);
        while (crossingIndex < unique.length && unique[crossingIndex] <= coordinate) {
          crossingIndex += 1;
        }
        inside[x + size * (y + size * z)] = crossingIndex % 2 === 1 ? 1 : 0;
      }
    }
  }

  const distanceToSurface = new Uint8Array(inside.length);
  distanceToSurface.fill(255);
  const queue = new Int32Array(inside.length);
  let queueStart = 0;
  let queueEnd = 0;
  const enqueueSurfacePair = (left: number, right: number) => {
    if (inside[left] === inside[right]) return;
    if (distanceToSurface[left] !== 0) {
      distanceToSurface[left] = 0;
      queue[queueEnd++] = left;
    }
    if (distanceToSurface[right] !== 0) {
      distanceToSurface[right] = 0;
      queue[queueEnd++] = right;
    }
  };

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = x + size * (y + size * z);
        if (x + 1 < size) enqueueSurfacePair(index, index + 1);
        if (y + 1 < size) enqueueSurfacePair(index, index + size);
        if (z + 1 < size) enqueueSurfacePair(index, index + size * size);
      }
    }
  }

  const visit = (from: number, to: number) => {
    const nextDistance = distanceToSurface[from] + 1;
    if (nextDistance >= distanceToSurface[to]) return;
    distanceToSurface[to] = nextDistance;
    queue[queueEnd++] = to;
  };
  while (queueStart < queueEnd) {
    const index = queue[queueStart++];
    const z = Math.floor(index / (size * size));
    const remainder = index - z * size * size;
    const y = Math.floor(remainder / size);
    const x = remainder - y * size;
    if (x > 0) visit(index, index - 1);
    if (x + 1 < size) visit(index, index + 1);
    if (y > 0) visit(index, index - size);
    if (y + 1 < size) visit(index, index + size);
    if (z > 0) visit(index, index - size * size);
    if (z + 1 < size) visit(index, index + size * size);
  }

  return { inside, distanceToSurface };
}
