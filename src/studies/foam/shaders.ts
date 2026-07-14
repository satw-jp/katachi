// ---------------------------------------------------------------------------
// Raymarching shader for the foam SDF. Mirrors cloud-sculpt/shaders.ts'
// structure (fullscreen quad, sphere-traced map()) but map() implements
// cell.ts's foamSdf() instead of the plain smooth-min union. The nearest-3
// tracking loop and every tuning constant below (OPEN_WIDTH_*, KEEP_SOFTEN,
// HOLE_PENALTY, WALL_BLEND) must stay in lockstep with cell.ts — CPU
// (mesh export) and GPU (this shader) must agree on what "foam" means.
//
// foamSdf is not an exact Euclidean distance field near an opened hole (see
// cell.ts header) — the raymarch step below is damped (STEP_DAMPING) to
// avoid overshooting thin threads. See README "Setup" for the measured
// response-speed cost of this compared to S1's exact-SDF raymarch.
// ---------------------------------------------------------------------------

export const MAX_BALLS = 256;

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
  uniform int uBallCount;
  uniform float uK;
  uniform float uOpening;
  uniform float uThickness;
  uniform float uCloudScale;
  uniform vec3 uCamPos;
  uniform mat4 uCamInverseProjection;
  uniform mat4 uCamInverseView;
  uniform vec2 uResolution;
  uniform vec3 uLightDir;

  varying vec2 vUv;

  float smoothMinF(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
  float smoothMaxF(float a, float b, float k) {
    return -smoothMinF(-a, -b, k);
  }
  float smoothstepLocal(float e0, float e1, float x) {
    if (e0 == e1) return x < e0 ? 0.0 : 1.0;
    float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  float sdBall(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
  }

  // The cloud's own surface (same smooth-min union as cloud-sculpt/shaders.ts).
  float surfaceField(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float bd = sdBall(p, uBallPos[i], uBallRadius[i]);
      d = (i == 0) ? bd : smoothMinF(d, bd, uK);
    }
    return d;
  }

  // Tuning constants — kept in lockstep with cell.ts.
  const float OPEN_WIDTH_MAX_FACTOR = 0.9;
  const float OPEN_WIDTH_MIN_FACTOR = 0.6;
  const float OPEN_WIDTH_FLOOR_FACTOR = 0.5;
  const float KEEP_SOFTEN = 0.65;
  const float HOLE_PENALTY = 6.0;
  const float WALL_BLEND = 0.3;

  float map(vec3 p) {
    if (uBallCount == 0) return 1e5;
    float surf = surfaceField(p);

    if (uBallCount == 1) {
      float shell = abs(surf) - uThickness;
      return max(shell, surf - uThickness);
    }

    float d1 = 1e5;
    float d2 = 1e5;
    float d3 = 1e5;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float d = sdBall(p, uBallPos[i], uBallRadius[i]);
      if (d < d1) { d3 = d2; d2 = d1; d1 = d; }
      else if (d < d2) { d3 = d2; d2 = d; }
      else if (d < d3) { d3 = d; }
    }

    float cellWall = d2 - d1;
    float cellEdge = (uBallCount >= 3) ? (d3 - d1) : 1e5;

    bool onWall = cellWall < abs(surf);
    float edgeDist = onWall ? cellEdge : cellWall;

    float big = uCloudScale * OPEN_WIDTH_MAX_FACTOR;
    float small = uThickness * OPEN_WIDTH_MIN_FACTOR;
    float openWidth = max(big + (small - big) * uOpening, uThickness * OPEN_WIDTH_FLOOR_FACTOR);

    float keep = 1.0 - smoothstepLocal(openWidth * KEEP_SOFTEN, openWidth, edgeDist);
    float holePenalty = (1.0 - keep) * HOLE_PENALTY;

    float membraneDist = smoothMinF(cellWall, abs(surf), uK * WALL_BLEND);
    float shellCore = membraneDist - uThickness;

    return smoothMaxF(shellCore + holePenalty, surf - uThickness, uK * WALL_BLEND);
  }

  vec3 estimateNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
      map(p + vec3(e, 0.0, 0.0)) - map(p - vec3(e, 0.0, 0.0)),
      map(p + vec3(0.0, e, 0.0)) - map(p - vec3(0.0, e, 0.0)),
      map(p + vec3(0.0, 0.0, e)) - map(p - vec3(0.0, 0.0, e))
    ));
  }

  // map() is not an exact distance field near opened holes (constant
  // hole penalty on top of a real SDF). Damping the step avoids
  // sphere-tracing overshoot through thin threads at the cost of more
  // iterations for the same convergence.
  const float STEP_DAMPING = 0.6;

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
    for (int i = 0; i < 220; i++) {
      p = ro + rd * t;
      float d = map(p);
      if (d < 0.001) { hit = true; break; }
      t += d * STEP_DAMPING;
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
    vec3 base = vec3(0.82, 0.85, 0.92);
    vec3 color = base * (0.2 + 0.8 * diff) + rim * 0.18;

    gl_FragColor = vec4(color, 1.0);
  }
`;
