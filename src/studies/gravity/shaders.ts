// ---------------------------------------------------------------------------
// Raymarching shader for S2: same metaball field as cloud-sculpt/shaders.ts,
// plus (a) a ground plane at y=0 unioned into the scene as a second SDF
// primitive, and (b) per-ball strain color replacing the flat base color.
// Must stay in lockstep with field.ts's fieldSdf (shared with S1) for the
// cloud part; the ground plane is exact (p.y) so it doesn't affect accuracy.
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
  // Normalized 0(楽/blue)..1(限界/red) strain per ball. Purely a derived
  // display value (physics.ts) — never part of the operation history.
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

  // Polynomial smooth-min (Inigo Quilez). k=0 -> hard min (see field.ts).
  float smoothMin(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float sdBall(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
  }

  // Cloud-only SDF (all balls smooth-min'd together). Same as S1's map().
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

  // Ground plane at y = 0, normal (0,1,0). Exact SDF.
  float mapPlane(vec3 p) {
    return p.y;
  }

  // Combined scene for raymarch stepping: whichever primitive is nearer.
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

  // Nearest ball index to a surface point, used for strain color + selection ring.
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

  // Blue (楽) -> red (限界), the common margin scale (AGENTS.md §5).
  vec3 strainColor(float t) {
    vec3 blue = vec3(0.30, 0.55, 0.95);
    vec3 red = vec3(0.95, 0.25, 0.20);
    // Slight gamma so the low-to-mid range (where most balls sit day-to-day)
    // shows visible movement instead of everything reading as "a bit blue".
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
      // Ground: a dim grid so scale and the接地 plane read clearly, without
      // competing with the strain color (計器としての正直さが主役).
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
