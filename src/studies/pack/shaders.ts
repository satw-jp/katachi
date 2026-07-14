// ---------------------------------------------------------------------------
// Raymarching shader for the composite (host minus void) field. Structurally
// mirrors cloud-sculpt/shaders.ts (fullscreen quad, sphere-traced map()) but
// carries TWO ball lists instead of one, combined with Quilez's smooth
// subtraction. Must stay in lockstep with field.ts's compositeSdf/
// opSmoothSubtraction (CPU picking, mesh export, gauges) — same discipline
// as foam/shaders.ts <-> foam/cell.ts.
//
// Standard sphere tracing needs no special handling for the carved cavity:
// when penetration opens a hole in the host skin, the ray simply keeps
// marching through the empty carved region (composite sdf >= 0 there) until
// it reaches the void's own far wall (composite sdf < 0 again) or exits the
// bounding sphere — this is what makes "食い込みを上げると開口が見える"
// (T9 完了条件2) show up on screen without any extra code.
//
// T14: the flat per-ball void arrays (uVoidPos/uVoidRadius) now come with a
// SECOND set of arrays describing UNIT boundaries within them
// (uUnitStart/uUnitCount/uUnitLocalK, uUnitTotal). voidField() is a genuine
// two-level smooth-min, mirroring field.ts's unitSdf/unitsFieldSdf exactly:
// level 1 blends a unit's own balls with ITS OWN local k (uUnitLocalK[u]),
// level 2 blends across units with the shared uRoundK — same nested-loop-
// with-break pattern this file already uses for hostField's HOST_MAX_BALLS
// cap, just one level deeper. Balls belonging to the same unit are always
// laid out contiguously in the flat arrays (renderer.ts's update() builds
// them that way), so a unit is just a [start, start+count) slice.
// ---------------------------------------------------------------------------

// Two separate caps (not one shared MAX_BALLS) because host and void are
// different lists rendered in the same frame; kept smaller than S1's single-
// field 256 so the combined per-step cost (host loop + void loop, each
// frame, each of 128 march steps) stays in the same ballpark as existing
// Studies. If packing produces more voids than VOID_MAX, only the first
// VOID_MAX are rendered (same documented cap style as cloud-sculpt's
// MAX_BALLS) — the full list still goes into the mesh/STL export and the
// gauges, which read state.units directly, not the shader's uniform arrays.
export const HOST_MAX_BALLS = 128;
export const VOID_MAX_BALLS = 192;
// T14: cloud units run 3-10 balls each per the task doc's example range, so
// 64 units comfortably covers VOID_MAX_BALLS/3 (worst case, all clouds at
// minimum size) without the unit array itself becoming the binding cap
// before the ball array does. 仮決め, documented in README.
export const VOID_MAX_UNITS = 64;

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uHostPos[${HOST_MAX_BALLS}];
  uniform float uHostRadius[${HOST_MAX_BALLS}];
  uniform int uHostCount;
  uniform float uHostK;

  uniform vec3 uVoidPos[${VOID_MAX_BALLS}];
  uniform float uVoidRadius[${VOID_MAX_BALLS}];
  uniform int uVoidCount;
  // T14: unit boundaries within the flat uVoidPos/uVoidRadius arrays. Unit u
  // owns balls [uUnitStart[u], uUnitStart[u] + uUnitCount[u]).
  uniform int uUnitStart[${VOID_MAX_UNITS}];
  uniform int uUnitCount[${VOID_MAX_UNITS}];
  uniform float uUnitLocalK[${VOID_MAX_UNITS}];
  uniform int uUnitTotal;
  uniform float uRoundK; // ACROSS-unit union roundness + host-minus-void subtraction (unchanged meaning)
  uniform int uMode; // 0 = carve (host − voids), 1 = fill (union of voids, host is a mold only)

  uniform vec3 uCamPos;
  uniform mat4 uCamInverseProjection;
  uniform mat4 uCamInverseView;
  uniform vec2 uResolution;
  uniform int uSelectedUnitIndex;
  uniform vec3 uLightDir;

  varying vec2 vUv;

  // Polynomial smooth-min (Inigo Quilez). k=0 -> hard min (see field.ts).
  float smoothMin(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // Quilez smooth subtraction: smooth(max(-d1, d2)). See field.ts's
  // opSmoothSubtraction doc comment for the exact same formula and why
  // (d1=void, d2=host) yields smooth(max(host, -void)).
  float opSmoothSubtraction(float d1, float d2, float k) {
    if (k <= 0.0) return max(-d1, d2);
    float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
    return mix(d2, -d1, h) + k * h * (1.0 - h);
  }

  float sdBall(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
  }

  float hostField(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < ${HOST_MAX_BALLS}; i++) {
      if (i >= uHostCount) break;
      float bd = sdBall(p, uHostPos[i], uHostRadius[i]);
      d = (i == 0) ? bd : smoothMin(d, bd, uHostK);
    }
    return d;
  }

  // T14 two-level blend: level 1 (this function's inner loop) blends one
  // unit's own balls with ITS OWN uUnitLocalK[u]; level 2 (outer loop)
  // blends across units with the shared uRoundK. Mirrors field.ts's
  // unitSdf/unitsFieldSdf exactly.
  float voidField(vec3 p) {
    float d = 1e5;
    for (int u = 0; u < ${VOID_MAX_UNITS}; u++) {
      if (u >= uUnitTotal) break;
      int start = uUnitStart[u];
      int count = uUnitCount[u];
      float localK = uUnitLocalK[u];
      float ud = 1e5;
      for (int i = 0; i < ${VOID_MAX_BALLS}; i++) {
        if (i < start) continue;
        if (i >= start + count) break;
        float bd = sdBall(p, uVoidPos[i], uVoidRadius[i]);
        ud = (i == start) ? bd : smoothMin(ud, bd, localK);
      }
      d = (u == 0) ? ud : smoothMin(d, ud, uRoundK);
    }
    return d;
  }

  // Composite, mode-dependent (T13 §1). "fill": host is a mold only, never
  // part of the printed result -- the composite is simply the units' own
  // two-level smooth union. "carve" (T9, default): host with the void field
  // carved out.
  float map(vec3 p) {
    if (uMode == 1) {
      if (uUnitTotal == 0) return 1e5;
      return voidField(p);
    }
    float dHost = hostField(p);
    if (uUnitTotal == 0) return dHost;
    float dVoid = voidField(p);
    return opSmoothSubtraction(dVoid, dHost, uRoundK);
  }

  vec3 estimateNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
      map(p + vec3(e, 0.0, 0.0)) - map(p - vec3(e, 0.0, 0.0)),
      map(p + vec3(0.0, e, 0.0)) - map(p - vec3(0.0, e, 0.0)),
      map(p + vec3(0.0, 0.0, e)) - map(p - vec3(0.0, 0.0, e))
    ));
  }

  // Nearest UNIT index to a surface point, used only for the selection ring
  // (T14: scans every ball, but reports its OWNING unit's index — same
  // "ownership by containment" lookup as field.ts's picking.ts on the CPU
  // side, kept in lockstep here for the raymarch highlight).
  int nearestUnit(vec3 p) {
    float best = 1e5;
    int bestUnit = -1;
    for (int u = 0; u < ${VOID_MAX_UNITS}; u++) {
      if (u >= uUnitTotal) break;
      int start = uUnitStart[u];
      int count = uUnitCount[u];
      for (int i = 0; i < ${VOID_MAX_BALLS}; i++) {
        if (i < start) continue;
        if (i >= start + count) break;
        float bd = sdBall(p, uVoidPos[i], uVoidRadius[i]);
        if (bd < best) { best = bd; bestUnit = u; }
      }
    }
    return bestUnit;
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
      if (t > 50.0) break;
    }

    // fill mode has no host geometry to bail out on (the host is a mold,
    // never rendered by the raymarch -- see updateBeads for the translucent
    // host backdrop, which is bead-view only, same as skin's host beads).
    if (!hit || (uMode == 0 && uHostCount == 0)) {
      float g = 0.5 + 0.5 * vUv.y;
      gl_FragColor = vec4(mix(vec3(0.055, 0.06, 0.075), vec3(0.09, 0.1, 0.12), g), 1.0);
      return;
    }

    vec3 n = estimateNormal(p);
    float diff = max(dot(n, normalize(uLightDir)), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);

    if (uMode == 1) {
      // fill mode: every surface point IS a unit's own surface (composite ==
      // voidField), so there is no "cavity wall vs outer skin" distinction
      // to make -- one solid body color (実の色, same base tone as the other
      // Studies' outer-skin color, T13 §3 "実を本体色で").
      vec3 base = vec3(0.86, 0.87, 0.9);
      vec3 color = base * (0.25 + 0.75 * diff) + rim * 0.15;
      if (uSelectedUnitIndex >= 0 && nearestUnit(p) == uSelectedUnitIndex) {
        color = mix(color, vec3(1.0, 0.75, 0.2), 0.5);
      }
      gl_FragColor = vec4(color, 1.0);
      return;
    }

    // Distinguish outer skin (host color) from a cavity wall (slightly cooler
    // tint) so an opened structure reads as hollow, not just re-textured —
    // a point is "on a cavity wall" if it sits close to some unit's own
    // surface (voidField crosses zero there) rather than only on the outer host skin.
    float dVoidHere = uUnitTotal > 0 ? voidField(p) : 1e5;
    bool onCavityWall = abs(dVoidHere) < 0.01;

    vec3 base = onCavityWall ? vec3(0.78, 0.82, 0.9) : vec3(0.86, 0.87, 0.9);
    vec3 color = base * (0.25 + 0.75 * diff) + rim * 0.15;

    if (uSelectedUnitIndex >= 0 && nearestUnit(p) == uSelectedUnitIndex && onCavityWall) {
      color = mix(color, vec3(1.0, 0.75, 0.2), 0.5);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;
