import * as THREE from "three";
import { FieldGpuPayload } from "./fieldGpuPayload.ts";
import { probeFieldGpuCapabilities, assessFieldGpuPayload } from "./fieldGpuCapabilities.ts";

/**
 * Resources created from a FieldGpuPayload and a WebGL context.
 *
 * Two textures are created:
 * - geometryTexture: RGBA float, stores position.xyz + radius
 * - metadataTexture: RGBA float, stores patchIndex, shapeCode, pointIndex, reserved
 *
 * Textures use NearestFilter and ClampToEdgeWrapping for exact data lookup.
 * Mipmaps are disabled.
 *
 * The payload is NOT mutated; textures are created from its arrays.
 */
export type FieldGpuTextureResources = {
  /** Geometry texture (RGBA float, NearestFilter, ClampToEdgeWrapping) */
  geometryTexture: THREE.DataTexture | null;
  /** Metadata texture (RGBA float, NearestFilter, ClampToEdgeWrapping) */
  metadataTexture: THREE.DataTexture | null;
  /** Number of primitives */
  primitiveCount: number;
  /** Texture width in texels */
  width: number;
  /** Texture height in texels */
  height: number;
};

/**
 * Create DataTexture resources from a FieldGpuPayload.
 *
 * Important:
 * - Does NOT modify the FieldGpuPayload.
 * - Uses RGBAFormat + FloatType + NearestFilter + ClampToEdgeWrapping + no mipmaps.
 * - If the GPU capability probe indicates the features are not supported,
 *   returns null for both textures.
 * - If primitiveCount === 0, returns explicit empty resource state (textures null).
 * - The caller is responsible for disposing both textures when done.
 *
 * @param payload - the FieldGpuPayload to create textures from
 * @param caps - result from probeFieldGpuCapabilities (may be null if no context)
 * @returns FieldGpuTextureResources with textures (or null if unsupported/empty)
 */
export function createFieldGpuTextures(
  payload: FieldGpuPayload,
  caps: FieldGpuCapabilities | null,
): FieldGpuTextureResources {
  const resources: FieldGpuTextureResources = {
    geometryTexture: null,
    metadataTexture: null,
    primitiveCount: payload.primitiveCount,
    width: payload.width,
    height: payload.height,
  };

  // Empty store → explicit empty resource state
  if (payload.primitiveCount === 0) {
    resources.geometryTexture = null;
    resources.metadataTexture = null;
    return resources;
  }

  // If no capability probe or not supported, return null textures
  if (!caps || !caps.supported) {
    resources.geometryTexture = null;
    resources.metadataTexture = null;
    return resources;
  }

  // Create geometry texture: RGBA float, stores position.xyz + radius
  const geometryData = payload.geometry;
  const geometryTex = new THREE.DataTexture(
    geometryData,
    payload.width,
    payload.height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  geometryTex.minFilter = THREE.NearestFilter;
  geometryTex.magFilter = THREE.NearestFilter;
  geometryTex.wrapS = THREE.ClampToEdgeWrapping;
  geometryTex.wrapT = THREE.ClampToEdgeWrapping;
  geometryTex.generateMipmaps = false;
  geometryTex.needsUpdate = true;

  // Create metadata texture: RGBA float, stores patchIndex, shapeCode, pointIndex, reserved
  const metadataData = payload.metadata;
  const metadataTex = new THREE.DataTexture(
    metadataData,
    payload.width,
    payload.height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  metadataTex.minFilter = THREE.NearestFilter;
  metadataTex.magFilter = THREE.NearestFilter;
  metadataTex.wrapS = THREE.ClampToEdgeWrapping;
  metadataTex.wrapT = THREE.ClampToEdgeWrapping;
  metadataTex.generateMipmaps = false;
  metadataTex.needsUpdate = true;

  resources.geometryTexture = geometryTex;
  resources.metadataTexture = metadataTex;

  return resources;
}

/**
 * Dispose both textures released by createFieldGpuTextures.
 * Must be called together; does not affect other GPU resources.
 */
export function disposeFieldGpuTextures(resources: FieldGpuTextureResources): void {
  if (resources.geometryTexture) {
    resources.geometryTexture.dispose();
    resources.geometryTexture = null as any;
  }
  if (resources.metadataTexture) {
    resources.metadataTexture.dispose();
    resources.metadataTexture = null as any;
  }
}