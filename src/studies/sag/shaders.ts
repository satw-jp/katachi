// ---------------------------------------------------------------------------
// Two raymarch shaders for S2b:
//   - main: the DEFORMED (sagged) cloud + ground, strain-colored — same
//     lockstep-with-field.ts approach and the same common blue/red palette
//     as S2's shaders.ts (AGENTS §5: 色は全 Study 共通スケール, never
//     reinvented here).
//   - ghost: the REST (休んでいる) cloud only, rendered translucent and
//     additively over the main pass so the two shapes' difference is legible
//     (T2b-sag.md §3). Not strain-colored — the ghost isn't a stress report,
//     it's a silhouette of the shape that would exist without gravity.
// ---------------------------------------------------------------------------

export const MAX_BALLS = 64;

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
  uniform float uBallStrain[${MAX_BALLS}];
  uniform int uBallCount;
  uniform float uK;
  uniform vec3 uCamPos;
  uniform mat4 uCamInverseProjection;
  uniform mat4 uCamInverseView;
  uniform vec2 uResolution;
  uniform int uSelectedIndex;
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

  float mapCloud(vec3 p) {
    if (uBallCount == 0) return 1e5;
    float d = 1e5;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float bd = sdBall(p, uBallPos[i], uBallRadius[i]);
      d = (i == 0) ? bd : smoothMin(d, bd, uK);
    }
    return d;
  }

  float mapPlane(vec3 p) {
    return p.y;
  }

  float map(vec3 p) {
    return min(mapCloud(p), mapPlane(p));
  }

  vec3 estimateCloudNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
      mapCloud(p + vec3(e, 0.0, 0.0)) - mapCloud(p - vec3(e, 0.0, 0.0)),
      mapCloud(p + vec3(0.0, e, 0.0)) - mapCloud(p - vec3(0.0, e, 0.0)),
      mapCloud(p + vec3(0.0, 0.0, e)) - mapCloud(p - vec3(0.0, 0.0, e))
    ));
  }

  int nearestBall(vec3 p) {
    float best = 1e5;
    int bestI = -1;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float bd = sdBall(p, uBallPos[i], uBallRadius[i]);
      if (bd < best) { best = bd; bestI = i; }
    }
    return bestI;
  }

  // Common margin scale (AGENTS.md §5) — same values as S2, unchanged.
  vec3 strainColor(float t) {
    vec3 blue = vec3(0.30, 0.55, 0.95);
    vec3 red = vec3(0.95, 0.25, 0.20);
    float tt = pow(clamp(t, 0.0, 1.0), 0.7);
    return mix(blue, red, tt);
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
    for (int i = 0; i < 160; i++) {
      p = ro + rd * t;
      float d = map(p);
      if (d < 0.001) { hit = true; break; }
      t += d;
      if (t > 60.0) break;
    }

    if (!hit) {
      float g = 0.5 + 0.5 * vUv.y;
      gl_FragColor = vec4(mix(vec3(0.055, 0.06, 0.075), vec3(0.09, 0.1, 0.12), g), 1.0);
      return;
    }

    float dCloud = mapCloud(p);
    float dPlane = mapPlane(p);
    vec3 color;

    if (dPlane <= dCloud) {
      vec3 n = vec3(0.0, 1.0, 0.0);
      float diff = max(dot(n, normalize(uLightDir)), 0.0);
      vec2 cell = fract(p.xz * 0.5) - 0.5;
      float line = smoothstep(0.46, 0.5, max(abs(cell.x), abs(cell.y)));
      vec3 base = mix(vec3(0.10, 0.11, 0.13), vec3(0.16, 0.17, 0.20), line);
      float fog = clamp(t / 60.0, 0.0, 1.0);
      color = mix(base * (0.35 + 0.5 * diff), vec3(0.09, 0.1, 0.12), fog);
    } else {
      vec3 n = estimateCloudNormal(p);
      float diff = max(dot(n, normalize(uLightDir)), 0.0);
      float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
      int bi = nearestBall(p);
      float strain = bi >= 0 ? uBallStrain[bi] : 0.0;
      vec3 base = strainColor(strain);
      color = base * (0.35 + 0.75 * diff) + rim * 0.12;

      if (uSelectedIndex >= 0 && bi == uSelectedIndex) {
        color = mix(color, vec3(1.0, 0.85, 0.3), 0.35);
      }
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Ghost pass: rest-shape cloud only, translucent, rendered as a second
// blended draw over the main pass (see renderer.ts). No ground, no strain —
// a silhouette, not a report.
export const ghostFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uBallPos[${MAX_BALLS}];
  uniform float uBallRadius[${MAX_BALLS}];
  uniform int uBallCount;
  uniform float uK;
  uniform vec3 uCamPos;
  uniform mat4 uCamInverseProjection;
  uniform mat4 uCamInverseView;

  varying vec2 vUv;

  float smoothMin(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float sdBall(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
  }

  float mapCloud(vec3 p) {
    if (uBallCount == 0) return 1e5;
    float d = 1e5;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float bd = sdBall(p, uBallPos[i], uBallRadius[i]);
      d = (i == 0) ? bd : smoothMin(d, bd, uK);
    }
    return d;
  }

  vec3 estimateCloudNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
      mapCloud(p + vec3(e, 0.0, 0.0)) - mapCloud(p - vec3(e, 0.0, 0.0)),
      mapCloud(p + vec3(0.0, e, 0.0)) - mapCloud(p - vec3(0.0, e, 0.0)),
      mapCloud(p + vec3(0.0, 0.0, e)) - mapCloud(p - vec3(0.0, 0.0, e))
    ));
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
      float d = mapCloud(p);
      if (d < 0.001) { hit = true; break; }
      t += d;
      if (t > 60.0) break;
    }

    if (!hit) {
      discard;
    }

    vec3 n = estimateCloudNormal(p);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 1.5);
    // Pale, neutral outline — a silhouette of "if it weren't sagging", not a
    // stress color. Alpha rises toward the rim so it reads as an outline
    // ghost rather than a flat translucent slab over the real shape.
    vec3 ghostColor = vec3(0.78, 0.82, 0.9);
    float alpha = clamp(0.06 + rim * 0.5, 0.0, 0.6);
    gl_FragColor = vec4(ghostColor, alpha);
  }
`;
