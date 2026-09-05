/**
 * GLSL3 FIELD vNext viewport shader.
 *
 * This is the actual semantic Golden preview path, not the Phase 2 sentinel
 * lab shader. Geometry and metadata are read from the row-major DataTextures;
 * the full primitive count is scanned for every field query, preserving the
 * sequential smooth-min order and shape grouping proven by
 * fieldVNextSemantic.ts.
 */

import { HOST_MAX_BALLS } from "./shaders.ts";

export const fieldVNextVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fieldVNextFragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform sampler2D uGeometry;
  uniform sampler2D uMetadata;
  uniform vec2 uTextureSize;
  uniform int uPrimitiveCount;

  uniform vec3 uHostPos[${HOST_MAX_BALLS}];
  uniform float uHostRadius[${HOST_MAX_BALLS}];
  uniform int uHostCount;
  uniform float uHostK;
  uniform float uThickness;
  uniform float uRoundK;
  uniform int uMode;
  uniform int uSelectedPatchOwner;
  uniform float uCoinBulge;
  uniform float uCoinBulgeBalance;

  uniform vec3 uCamPos;
  uniform mat4 uCamInverseProjection;
  uniform mat4 uCamInverseView;
  uniform float uCameraOrthographic;
  uniform vec2 uResolution;
  uniform vec3 uLightDir;
  uniform vec3 uClipEnabled;
  uniform vec3 uClipPosition;
  uniform vec3 uClipDirection;

  in vec2 vUv;
  out vec4 outColor;

  float smoothMinG(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float opSmoothSubtraction(float d1, float d2, float k) {
    if (k <= 0.0) return max(-d1, d2);
    float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
    return mix(d2, -d1, h) + k * h * (1.0 - h);
  }

  float opSmoothIntersection(float d1, float d2, float k) {
    if (k <= 0.0) return max(d1, d2);
    float h = clamp(0.5 - 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) + k * h * (1.0 - h);
  }

  float sdBall(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
  }

  vec4 geometryAt(int index) {
    float column = mod(float(index), uTextureSize.x);
    float row = floor(float(index) / uTextureSize.x);
    return texelFetch(uGeometry, ivec2(int(column), int(row)), 0);
  }

  vec4 metadataAt(int index) {
    float column = mod(float(index), uTextureSize.x);
    float row = floor(float(index) / uTextureSize.x);
    return texelFetch(uMetadata, ivec2(int(column), int(row)), 0);
  }

  float hostField(vec3 p) {
    if (uHostCount <= 0) return 1e3;
    float d = sdBall(p, uHostPos[0], uHostRadius[0]);
    for (int index = 1; index < ${HOST_MAX_BALLS}; index++) {
      if (index >= uHostCount) break;
      float candidate = sdBall(p, uHostPos[index], uHostRadius[index]);
      d = smoothMinG(d, candidate, uHostK);
    }
    return d;
  }

  float shellField(vec3 p) {
    return abs(hostField(p)) - uThickness * 0.5;
  }

  float patchField(vec3 p, int shapeFilter) {
    float d = 1e5;
    bool any = false;
    for (int index = 0; index < uPrimitiveCount; index++) {
      vec4 metadata = metadataAt(index);
      int shapeCode = int(metadata.g + 0.5);
      if (shapeFilter >= 0 && shapeFilter != 4 && shapeCode != shapeFilter) continue;
      if (shapeFilter == 4 && shapeCode != 2 && shapeCode != 3) continue;
      vec4 geometry = geometryAt(index);
      float candidate = sdBall(p, geometry.xyz, geometry.w);
      d = any ? smoothMinG(d, candidate, uRoundK) : candidate;
      any = true;
    }
    return d;
  }

  float patchFieldFlat(vec3 p) {
    float d = 1e5;
    bool any = false;
    for (int index = 0; index < uPrimitiveCount; index++) {
      int shapeCode = int(metadataAt(index).g + 0.5);
      if (shapeCode == 2 || shapeCode == 3) continue;
      vec4 geometry = geometryAt(index);
      float candidate = sdBall(p, geometry.xyz, geometry.w);
      d = any ? smoothMinG(d, candidate, uRoundK) : candidate;
      any = true;
    }
    return d;
  }

  float mapField(vec3 p) {
    float dShell = shellField(p);
    if (uPrimitiveCount == 0) {
      return uMode == 0 ? 1e5 : dShell;
    }
    if (uMode == 1) {
      return opSmoothSubtraction(patchField(p, -1), dShell, uRoundK);
    }
    if (uCoinBulge <= 0.0) {
      float plateFlat = opSmoothIntersection(dShell, patchFieldFlat(p), uRoundK);
      float dRaised = patchField(p, 4);
      bool hasRaised = dRaised < 9.0e4;
      return hasRaised
        ? smoothMinG(plateFlat, dRaised, uRoundK)
        : plateFlat;
    }

    float dCoin = patchField(p, 0);
    float dFlatRing = patchField(p, 1);
    float dRaised = patchField(p, 4);
    bool hasCoin = dCoin < 9.0e4;
    bool hasFlatRing = dFlatRing < 9.0e4;
    bool hasRaised = dRaised < 9.0e4;
    float balance = clamp(uCoinBulgeBalance, -1.0, 1.0);
    float frontExtra = balance >= 0.0 ? uCoinBulge : uCoinBulge * (1.0 + balance);
    float backExtra = balance <= 0.0 ? uCoinBulge : uCoinBulge * (1.0 - balance);
    float hostDistance = hostField(p);
    float dCoinBand = max(
      hostDistance - (uThickness * 0.5 + frontExtra),
      -hostDistance - (uThickness * 0.5 + backExtra)
    );

    float plateFlat = 1e5;
    bool hasFlat = false;
    if (hasCoin) {
      plateFlat = opSmoothIntersection(dCoinBand, dCoin, uRoundK);
      hasFlat = true;
    }
    if (hasFlatRing) {
      float plateFlatRing = opSmoothIntersection(dShell, dFlatRing, uRoundK);
      plateFlat = hasFlat
        ? smoothMinG(plateFlat, plateFlatRing, uRoundK)
        : plateFlatRing;
      hasFlat = true;
    }
    if (!hasRaised) return hasFlat ? plateFlat : 1e5;
    return hasFlat ? smoothMinG(plateFlat, dRaised, uRoundK) : dRaised;
  }

  int nearestPatchOwner(vec3 p) {
    float best = 1e5;
    int bestOwner = -1;
    for (int index = 0; index < uPrimitiveCount; index++) {
      vec4 geometry = geometryAt(index);
      float candidate = sdBall(p, geometry.xyz, geometry.w);
      if (candidate < best) {
        best = candidate;
        bestOwner = int(metadataAt(index).r + 0.5);
      }
    }
    return bestOwner;
  }

  vec3 estimateNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
      mapField(p + vec3(e, 0.0, 0.0)) - mapField(p - vec3(e, 0.0, 0.0)),
      mapField(p + vec3(0.0, e, 0.0)) - mapField(p - vec3(0.0, e, 0.0)),
      mapField(p + vec3(0.0, 0.0, e)) - mapField(p - vec3(0.0, 0.0, e))
    ));
  }

  vec2 clipAxisRayInterval(float enabled, float origin, float direction, float position, float keepDirection) {
    if (enabled < 0.5) return vec2(-1e5, 1e5);
    float signedOrigin = keepDirection * (origin - position);
    float signedRate = keepDirection * direction;
    if (abs(signedRate) < 1e-7) return signedOrigin >= 0.0 ? vec2(-1e5, 1e5) : vec2(1.0, 0.0);
    float crossing = -signedOrigin / signedRate;
    return signedRate > 0.0 ? vec2(crossing, 1e5) : vec2(-1e5, crossing);
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 clip = vec4(ndc, -1.0, 1.0);
    vec4 nearView = uCamInverseProjection * clip;
    nearView /= max(abs(nearView.w), 1.0e-7);
    vec4 perspectiveDirection = vec4(nearView.xy, -1.0, 0.0);
    vec3 forward = normalize((uCamInverseView * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
    vec3 rd = uCameraOrthographic > 0.5
      ? forward
      : normalize((uCamInverseView * perspectiveDirection).xyz);
    vec3 ro = uCameraOrthographic > 0.5
      ? (uCamInverseView * vec4(nearView.xyz, 1.0)).xyz
      : uCamPos;

    vec2 clipX = clipAxisRayInterval(uClipEnabled.x, ro.x, rd.x, uClipPosition.x, uClipDirection.x);
    vec2 clipY = clipAxisRayInterval(uClipEnabled.y, ro.y, rd.y, uClipPosition.y, uClipDirection.y);
    vec2 clipZ = clipAxisRayInterval(uClipEnabled.z, ro.z, rd.z, uClipPosition.z, uClipDirection.z);
    float clipStart = max(0.0, max(clipX.x, max(clipY.x, clipZ.x)));
    float clipEnd = min(50.0, min(clipX.y, min(clipY.y, clipZ.y)));
    bool clipIntervalValid = clipStart <= clipEnd;
    float t = clipStart > 0.0 ? clipStart + 0.0005 : 0.0;
    bool hit = false;
    vec3 p = ro;
    for (int march = 0; march < 160; march++) {
      if (!clipIntervalValid || t > clipEnd) break;
      p = ro + rd * t;
      float d = mapField(p);
      if (abs(d) < 0.001) { hit = true; break; }
      t += max(abs(d), 0.0005);
      if (t > clipEnd) break;
    }

    if (!hit || uHostCount == 0) {
      float g = 0.5 + 0.5 * vUv.y;
      outColor = vec4(mix(vec3(0.055, 0.06, 0.075), vec3(0.09, 0.1, 0.12), g), 1.0);
      return;
    }

    vec3 normal = estimateNormal(p);
    float diff = max(dot(normal, normalize(uLightDir)), 0.0);
    float rim = pow(1.0 - max(dot(normal, -rd), 0.0), 2.0);
    float patchDistance = uPrimitiveCount > 0 ? patchField(p, -1) : 1e5;
    bool onPatch = uMode == 0 ? uPrimitiveCount > 0 : abs(patchDistance) < 0.01;
    vec3 base = onPatch ? vec3(0.9, 0.72, 0.5) : vec3(0.86, 0.87, 0.9);
    vec3 color = base * (0.25 + 0.75 * diff) + rim * 0.15;
    if (uSelectedPatchOwner >= 0 && onPatch && nearestPatchOwner(p) == uSelectedPatchOwner) {
      color = mix(color, vec3(1.0, 0.75, 0.2), 0.5);
    }
    outColor = vec4(color, 1.0);
  }
`;
