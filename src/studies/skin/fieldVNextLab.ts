/**
 * SKIN FIELD vNext — Shadow Lab.
 *
 * This is an isolated browser gate for the Phase 2A/2B DataTexture payload.
 * It proves the 256 → 257 boundary with a real GPU render-target readback;
 * it does not change the production FIELD renderer or shader.
 */
import * as THREE from 'three';
import type { FieldPrimitive } from './fieldPrimitiveStore';
import { encodeGpuShapeCode, packFieldGpuPayload } from './fieldGpuPayload';
import { createFieldGpuTextures } from './fieldGpuTextures';
import { assessFieldGpuPayload, probeFieldGpuCapabilities } from './fieldGpuCapabilities';

const canvasElement = document.querySelector('#viewport') as HTMLCanvasElement | null;
const statusElement = document.getElementById('status') as HTMLSpanElement | null;
const primCountElement = document.getElementById('primCount') as HTMLSpanElement | null;
const infoElement = document.querySelector('.info') as HTMLDivElement | null;

if (!canvasElement || !statusElement || !primCountElement || !infoElement) {
  throw new Error('FIELD vNext lab markup is incomplete');
}

const canvas = canvasElement;
const statusDiv = statusElement;
const primCountDiv = primCountElement;
const infoDiv = infoElement;

infoDiv.style.whiteSpace = 'pre-wrap';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.Camera();
const gl = renderer.getContext();
const caps = probeFieldGpuCapabilities(gl);

const COUNT_OPTS = [64, 256, 257, 512, 1024, 2048] as const;
type CountOpt = typeof COUNT_OPTS[number];
let currentCount: CountOpt = 257;

const countSelect = document.createElement('select');
countSelect.style.position = 'absolute';
countSelect.style.top = '1rem';
countSelect.style.right = '1rem';
countSelect.style.zIndex = '10';
countSelect.innerHTML = COUNT_OPTS.map(
  (count) => `<option value="${count}" ${count === currentCount ? 'selected' : ''}>${count}</option>`,
).join('');
countSelect.addEventListener('change', () => {
  const nextCount = Number(countSelect.value);
  if (COUNT_OPTS.includes(nextCount as CountOpt)) {
    currentCount = nextCount as CountOpt;
    initLab();
  }
});
document.body.appendChild(countSelect);

let activeQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
let activeTarget: THREE.WebGLRenderTarget | null = null;

function resizeRenderer(): void {
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  renderer.setSize(width, height, false);
}

resizeRenderer();
renderer.setPixelRatio(window.devicePixelRatio);
window.addEventListener('resize', resizeRenderer);

function makePrim(
  position: { x: number; y: number; z: number },
  radius: number,
  shape: FieldPrimitive['shape'],
  patchIndex: number,
): FieldPrimitive {
  return {
    position: { ...position },
    radius,
    shape,
    patchIndex,
    patchId: patchIndex,
    pointIndex: patchIndex,
  };
}

function generateTestPrims(count: number): FieldPrimitive[] {
  const shapes: readonly FieldPrimitive['shape'][] = ['coin', 'flatRing', 'ring3d', 'flower'];
  const primitives: FieldPrimitive[] = [];
  for (let i = 0; i < count; i++) {
    primitives.push(makePrim(
      {
        x: (i % 20) * 1.3 - 12.5 + (i % 3) * 0.1,
        y: Math.floor(i / 20) * 1.3 - 12.5 + (Math.floor(i / 3) % 3) * 0.1,
        z: 0,
      },
      0.3 + (i * 0.07) % 0.5,
      shapes[i % shapes.length] ?? 'coin',
      i,
    ));
  }
  return primitives;
}

/** Canonical row-major texel-center address shared by both payload textures. */
function texelUV(index: number, width: number, height: number): { u: number; v: number } {
  const column = index % width;
  const row = Math.floor(index / width);
  return {
    u: (column + 0.5) / width,
    v: (row + 0.5) / height,
  };
}

type SentinelReadback = {
  patchIndex: boolean;
  shapeCode: boolean;
  radius: boolean;
  alpha: boolean;
};

function readSentinelFromGpu(
  material: THREE.ShaderMaterial,
  target: THREE.WebGLRenderTarget,
): SentinelReadback {
  material.needsUpdate = true;
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);

  const pixels = new Uint8Array(4);
  renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixels);
  renderer.setRenderTarget(null);

  return {
    patchIndex: pixels[0] >= 250,
    shapeCode: pixels[1] >= 250,
    radius: pixels[2] >= 250,
    alpha: pixels[3] >= 250,
  };
}

function disposeActiveResources(): void {
  if (activeQuad) {
    scene.remove(activeQuad);
    activeQuad.geometry.dispose();
    activeQuad.material.dispose();
    activeQuad = null;
  }
  if (activeTarget) {
    activeTarget.dispose();
    activeTarget = null;
  }
}

function initLab(): void {
  disposeActiveResources();

  if (!caps.supported) {
    statusDiv.textContent = 'FIELD vNext — GPU capability FAIL';
    infoDiv.textContent = [
      'Browser Gate: FAIL',
      `Capability: FAIL (${caps.reasons.join(', ')})`,
      'No GPU readback was attempted.',
    ].join('\n');
    return;
  }

  const count = currentCount;
  const primitives = generateTestPrims(count);
  const maxTextureSize = Math.min(256, caps.maxTextureSize);
  const payload = packFieldGpuPayload(primitives, maxTextureSize);
  const assessment = assessFieldGpuPayload(caps, payload);
  const resources = createFieldGpuTextures(payload, caps);
  const sentinel = primitives[count - 1];

  if (!sentinel || !resources.geometryTexture || !resources.metadataTexture) {
    statusDiv.textContent = `FIELD vNext — count=${count} setup FAIL`;
    infoDiv.textContent = 'Browser Gate: FAIL\nDataTexture resources were not created.';
    return;
  }

  const expectedPatchIndex = sentinel.patchIndex;
  const expectedShapeCode = encodeGpuShapeCode(sentinel.shape);
  const expectedRadius = sentinel.radius;
  const lastIndex = count - 1;
  const uv = texelUV(lastIndex, payload.width, payload.height);
  const lastBase = lastIndex * 4;
  const cpuPacked = (
    payload.primitiveCount === count &&
    payload.geometry.length === payload.width * payload.height * 4 &&
    payload.metadata.length === payload.width * payload.height * 4 &&
    payload.metadata[lastBase] === expectedPatchIndex &&
    payload.metadata[lastBase + 1] === expectedShapeCode &&
    Math.abs(payload.geometry[lastBase + 3] - expectedRadius) < 0.001
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uGeometry: { value: resources.geometryTexture },
      uMetadata: { value: resources.metadataTexture },
      uSentinelIndex: { value: lastIndex },
      uTextureSize: { value: new THREE.Vector2(payload.width, payload.height) },
      uExpectedPatchIndex: { value: expectedPatchIndex },
      uExpectedShapeCode: { value: expectedShapeCode },
      uExpectedRadius: { value: expectedRadius },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uGeometry;
      uniform sampler2D uMetadata;
      uniform float uSentinelIndex;
      uniform vec2 uTextureSize;
      uniform float uExpectedPatchIndex;
      uniform float uExpectedShapeCode;
      uniform float uExpectedRadius;

      void main() {
        float column = mod(uSentinelIndex, uTextureSize.x);
        float row = floor(uSentinelIndex / uTextureSize.x);
        vec2 sentinelUv = (vec2(column, row) + vec2(0.5)) / uTextureSize;

        // Geometry and metadata intentionally use the exact same UV.
        vec4 metadata = texture2D(uMetadata, sentinelUv);
        vec4 geometry = texture2D(uGeometry, sentinelUv);

        float patchIndexMatch = 1.0 - step(0.001, abs(metadata.r - uExpectedPatchIndex));
        float shapeCodeMatch = 1.0 - step(0.001, abs(metadata.g - uExpectedShapeCode));
        float radiusMatch = 1.0 - step(0.001, abs(geometry.a - uExpectedRadius));
        gl_FragColor = vec4(patchIndexMatch, shapeCodeMatch, radiusMatch, 1.0);
      }
    `,
  });

  activeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(activeQuad);
  activeTarget = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const gpu = readSentinelFromGpu(material, activeTarget);
  const gpuLastTexelFetch = gpu.patchIndex && gpu.shapeCode && gpu.radius && gpu.alpha;
  const browserGate = assessment.supported && cpuPacked && gpuLastTexelFetch;

  statusDiv.textContent = `FIELD vNext — count=${count} — ${browserGate ? 'PASS' : 'FAIL'}`;
  primCountDiv.textContent = `${payload.primitiveCount} / ${count}`;
  infoDiv.textContent = [
    'FIELD vNext — DataTexture 2D boundary readback',
    `requested: ${count}`,
    `packed: ${payload.primitiveCount}`,
    `texture: ${payload.width} × ${payload.height}`,
    `last index: ${lastIndex}`,
    `last texel UV: (${uv.u.toFixed(6)}, ${uv.v.toFixed(6)})`,
    '',
    `CPU packed: ${cpuPacked ? 'PASS' : 'FAIL'}`,
    `GPU patchIndex: ${gpu.patchIndex ? 'PASS' : 'FAIL'}`,
    `GPU shapeCode: ${gpu.shapeCode ? 'PASS' : 'FAIL'}`,
    `GPU radius: ${gpu.radius ? 'PASS' : 'FAIL'}`,
    `GPU last-texel fetch: ${gpuLastTexelFetch ? 'PASS' : 'FAIL'}`,
    `Browser Gate: ${browserGate ? 'PASS' : 'FAIL'}`,
    '',
    'Addressing: column = index % width; row = floor(index / width)',
    'Both textures use (column + 0.5, row + 0.5) / (width, height)',
    `Capability: ${assessment.supported ? 'PASS' : `FAIL (${assessment.reasons.join(', ')})`}`,
  ].join('\n');

  // Re-render the same result to the visible canvas after the readback.
  renderer.render(scene, camera);
  console.log(`[FIELD vNext] count=${count} CPU=${cpuPacked ? 'PASS' : 'FAIL'} GPU=${gpuLastTexelFetch ? 'PASS' : 'FAIL'} Gate=${browserGate ? 'PASS' : 'FAIL'}`);
}

initLab();
