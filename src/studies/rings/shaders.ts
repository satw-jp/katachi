// ---------------------------------------------------------------------------
// Raymarching shader for S-rings — same technique as cloud-sculpt/shaders.ts
// (metaball field, no mesh step) with one difference: selection here is a
// *ring* (many balls), not a single ball, so uSelectedIndex is replaced by
// a per-ball float array uBallHighlight[MAX_BALLS] (0/1) that main.ts fills
// from the selected ring's member ball ids.
// ---------------------------------------------------------------------------

import { MAX_BALLS } from "../cloud-sculpt/shaders.ts";

export { MAX_BALLS };

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uBallPos[${MAX_BALLS}];
  uniform float uBallRadius[${MAX_BALLS}];
  uniform float uBallHighlight[${MAX_BALLS}];
  uniform int uBallCount;
  uniform float uK;
  uniform vec3 uCamPos;
  uniform mat4 uCamInverseProjection;
  uniform mat4 uCamInverseView;
  uniform vec2 uResolution;
  uniform vec3 uLightDir;

  varying vec2 vUv;

  float smoothMin(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float sdBall(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
  }

  // Whole-field SDF: all balls smooth-min'd together.
  // Must stay in lockstep with fieldSdf() in cloud-sculpt/field.ts (shared CPU picking).
  float map(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float bd = sdBall(p, uBallPos[i], uBallRadius[i]);
      d = (i == 0) ? bd : smoothMin(d, bd, uK);
    }
    return d;
  }

  vec3 estimateNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
      map(p + vec3(e, 0.0, 0.0)) - map(p - vec3(e, 0.0, 0.0)),
      map(p + vec3(0.0, e, 0.0)) - map(p - vec3(0.0, e, 0.0)),
      map(p + vec3(0.0, 0.0, e)) - map(p - vec3(0.0, 0.0, e))
    ));
  }

  // Highlight flag of the nearest ball to a surface point (avoids returning
  // a dynamic index and indexing the uniform array a second time, which is
  // not guaranteed to compile under GLSL ES 1.0 / WebGL1 fallback).
  float nearestBallHighlight(vec3 p) {
    float best = 1e5;
    float bestHighlight = 0.0;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float bd = sdBall(p, uBallPos[i], uBallRadius[i]);
      if (bd < best) { best = bd; bestHighlight = uBallHighlight[i]; }
    }
    return bestHighlight;
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 clip = vec4(ndc, -1.0, 1.0);
    vec4 viewDir4 = uCamInverseProjection * clip;
    viewDir4 = vec4(viewDir4.xy, -1.0, 0.0);
    vec3 rd = normalize((uCamInverseView * viewDir4).xyz);
    vec3 ro = uCamPos;

    float t = 0.0;
    bool hit = false;
    vec3 p = ro;
    for (int i = 0; i < 128; i++) {
      p = ro + rd * t;
      float d = map(p);
      if (d < 0.001) { hit = true; break; }
      t += d;
      if (t > 50.0) break;
    }

    if (!hit || uBallCount == 0) {
      float g = 0.5 + 0.5 * vUv.y;
      gl_FragColor = vec4(mix(vec3(0.055, 0.06, 0.075), vec3(0.09, 0.1, 0.12), g), 1.0);
      return;
    }

    vec3 n = estimateNormal(p);
    float diff = max(dot(n, normalize(uLightDir)), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
    vec3 base = vec3(0.86, 0.87, 0.9);
    vec3 color = base * (0.25 + 0.75 * diff) + rim * 0.15;

    if (nearestBallHighlight(p) > 0.5) {
      color = mix(color, vec3(1.0, 0.75, 0.2), 0.5);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;
