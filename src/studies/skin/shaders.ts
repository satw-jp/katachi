// ---------------------------------------------------------------------------
// Raymarching shader for the composite (shell boolean patches) field.
// Structurally mirrors pack/shaders.ts (fullscreen quad, sphere-traced
// map()) but carries: host balls, one flat patch-point array (every patch's
// points concatenated, T10's patches are a plain union like pack's voids),
// a per-point "owner" index for the selection highlight, and a mode switch
// (0 = plate = shell ∩ patches, 1 = window = shell − patches). Must stay in
// lockstep with field.ts's shellSdf/patchesSdf/compositeSdf -- same
// discipline as every other Study's shaders.ts <-> field.ts pair.
//
// Standard sphere tracing needs no special handling for either mode: in
// window mode, a ray that enters a carved opening keeps marching through
// the empty region (composite sdf >= 0) until it reaches the cavity's far
// wall, exactly like pack's shell/void tracing. In plate mode there is
// mostly empty space between plates (shell ∩ patches is empty wherever no
// patch reaches) so the ray just marches through and either hits a plate or
// exits the bounding sphere -- again nothing extra to write.
//
// T11 adds a per-point "is this a ring3d node" flag, folded into the
// existing uPatchData[i].y owner slot as a fractional offset (ownerIndex +
// 0.5 for ring3d, +0.0 otherwise) rather than a fourth uniform array, to
// stay under the fragment uniform-vector budget this Study already hit once
// (see PATCH_MAX_POINTS below). map()'s plate-mode branch uses that flag to
// keep ring3d patches OUT of the shell intersection (field.ts's
// compositeSdf doc comment explains why: a ring only touches the surface at
// one circle and would be sliced to a sliver if clipped to the shell band).
// ---------------------------------------------------------------------------

export const HOST_MAX_BALLS = 96;
// Every patch's points flattened into one array (patches can have several
// sub-points each, T10 §1's "副点"). Kept well under the GLSL fragment
// uniform-vector budget (MAX_FRAGMENT_UNIFORM_VECTORS, 1024 on the software
// WebGL renderer this Study was verified against -- a first pass at 768
// blew that budget once uHostPos/uHostRadius/uPatchPos/uPatchRadius/
// uPatchOwner were all counted, so radius+owner were folded into one vec2
// array (uPatchData) to cut the uniform-array count from 3 to 2 for
// patches, and this cap was lowered alongside it). The full patch list
// still goes into the mesh/STL export and the gauges, which read state
// directly, not the shader's uniform arrays -- same documented-cap style as
// every other Study here.
export const PATCH_MAX_POINTS = 256;
// Distinct patches, for the per-patch selection highlight only (owner index
// -> which slot in this array is "selected").
export const PATCH_MAX_COUNT = 160;

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
  uniform float uThickness;

  uniform vec3 uPatchPos[${PATCH_MAX_POINTS}];
  // x = radius, y = owner index (as a float; rounded back to int in GLSL) --
  // folded into one vec2 array instead of two separate float/int arrays to
  // keep the fragment shader's uniform-vector count under budget (see the
  // PATCH_MAX_POINTS comment above). T14: the fractional part now also
  // distinguishes coin (+0.00) / flatRing (+0.25) / ring3d (+0.50), decoded
  // by isCoinPoint/isFlatRingPoint/isRingPoint below.
  uniform vec2 uPatchData[${PATCH_MAX_POINTS}];
  uniform int uPatchPointCount;
  uniform float uRoundK;
  uniform int uMode; // 0 = plate (shell ∩ patches), 1 = window (shell − patches)
  uniform int uSelectedPatchOwner; // -1 = none
  // T14 coin-bulge experiment (field.ts's compositeSdf doc comment carries
  // the full rationale/hypothesis framing -- kept in one place, not
  // restated here). 0 = old exact shell-clip formula for every plate-mode
  // shape; >0 = coin patches alone get a wider shell band.
  uniform float uCoinBulge;

  uniform vec3 uCamPos;
  uniform mat4 uCamInverseProjection;
  uniform mat4 uCamInverseView;
  uniform vec2 uResolution;
  uniform vec3 uLightDir;

  varying vec2 vUv;

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

  float hostField(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < ${HOST_MAX_BALLS}; i++) {
      if (i >= uHostCount) break;
      float bd = sdBall(p, uHostPos[i], uHostRadius[i]);
      d = (i == 0) ? bd : smoothMinG(d, bd, uHostK);
    }
    return d;
  }

  float shellField(vec3 p) {
    return abs(hostField(p)) - uThickness * 0.5;
  }

  // uPatchData[i].y encodes BOTH the owning patch's index (for the
  // selection highlight) and its shape -- ownerIndex + shapeOffset, folded
  // into one float to avoid extra uniform arrays (see PATCH_MAX_POINTS
  // comment: this Study already hit the fragment uniform-vector budget
  // once). T14 extends the fraction from a single ring3d bit to three
  // shapes: coin +0.00, flatRing +0.25, ring3d +0.50 (renderer.ts's
  // ownerEncoded). Decode with floor/fract; owner itself is always
  // floor(y + 0.01) regardless of shape, unchanged from before.
  bool isCoinPoint(int i) {
    return fract(uPatchData[i].y) < 0.125;
  }
  bool isFlatRingPoint(int i) {
    float f = fract(uPatchData[i].y);
    return f >= 0.125 && f < 0.375;
  }
  bool isRingPoint(int i) {
    return fract(uPatchData[i].y) >= 0.375;
  }

  float patchField(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < ${PATCH_MAX_POINTS}; i++) {
      if (i >= uPatchPointCount) break;
      float bd = sdBall(p, uPatchPos[i], uPatchData[i].x);
      d = (i == 0) ? bd : smoothMinG(d, bd, uRoundK);
    }
    return d;
  }

  // Union of only the non-ring3d (coin/flatRing) patch points -- T11's
  // plate-mode split (see field.ts's compositeSdf doc comment: these stay
  // flush with the shell, ring3d patches do not). Used only on the
  // coinBulge<=0 (old exact) path -- see map() below.
  float patchFieldFlat(vec3 p) {
    float d = 1e5;
    bool any = false;
    for (int i = 0; i < ${PATCH_MAX_POINTS}; i++) {
      if (i >= uPatchPointCount) break;
      if (isRingPoint(i)) continue;
      float bd = sdBall(p, uPatchPos[i], uPatchData[i].x);
      d = any ? smoothMinG(d, bd, uRoundK) : bd;
      any = true;
    }
    return d;
  }

  // Union of only ring3d patch points.
  float patchFieldRing(vec3 p) {
    float d = 1e5;
    bool any = false;
    for (int i = 0; i < ${PATCH_MAX_POINTS}; i++) {
      if (i >= uPatchPointCount) break;
      if (!isRingPoint(i)) continue;
      float bd = sdBall(p, uPatchPos[i], uPatchData[i].x);
      d = any ? smoothMinG(d, bd, uRoundK) : bd;
      any = true;
    }
    return d;
  }

  // T14: union of only coin points / only flatRing points, each evaluated
  // separately so coinBulge>0 can clip coin to a different band than
  // flatRing. 1e5 (with no contributing point) if that shape isn't present,
  // same "nothing here" convention field.ts's patchesSdf uses.
  float patchFieldCoinOnly(vec3 p) {
    float d = 1e5;
    bool any = false;
    for (int i = 0; i < ${PATCH_MAX_POINTS}; i++) {
      if (i >= uPatchPointCount) break;
      if (!isCoinPoint(i)) continue;
      float bd = sdBall(p, uPatchPos[i], uPatchData[i].x);
      d = any ? smoothMinG(d, bd, uRoundK) : bd;
      any = true;
    }
    return d;
  }

  float patchFieldFlatRingOnly(vec3 p) {
    float d = 1e5;
    bool any = false;
    for (int i = 0; i < ${PATCH_MAX_POINTS}; i++) {
      if (i >= uPatchPointCount) break;
      if (!isFlatRingPoint(i)) continue;
      float bd = sdBall(p, uPatchPos[i], uPatchData[i].x);
      d = any ? smoothMinG(d, bd, uRoundK) : bd;
      any = true;
    }
    return d;
  }

  float map(vec3 p) {
    float dShell = shellField(p);
    if (uPatchPointCount == 0) {
      return uMode == 0 ? 1e5 : dShell;
    }
    if (uMode == 1) {
      // window: any patch shape just carves the shell, same as T10 --
      // unaffected by uCoinBulge (field.ts's compositeSdf doc comment).
      float dPatch = patchField(p);
      return opSmoothSubtraction(dPatch, dShell, uRoundK);
    }
    if (uCoinBulge <= 0.0) {
      // plate, old exact path: coin/flatRing stay flush with the shell as
      // ONE unioned field (not split), ring3d raw -- see field.ts's
      // compositeSdf doc comment for why this must stay a literal separate
      // branch instead of "split with a zero-width extra band" (smooth
      // booleans are not distributive).
      float plateFlat = opSmoothIntersection(dShell, patchFieldFlat(p), uRoundK);
      float dRing = patchFieldRing(p);
      return smoothMinG(plateFlat, dRing, uRoundK);
    }
    // plate, coinBulge > 0: coin/flatRing/ring3d are three separate groups,
    // each intersected (or left raw, for ring3d) with its own band, then
    // unioned -- exact GLSL mirror of field.ts's compositeSdf coinBulge>0
    // branch.
    float dCoinPatch = patchFieldCoinOnly(p);
    float dFlatRingPatch = patchFieldFlatRingOnly(p);
    float dRingPatch = patchFieldRing(p);
    bool hasCoin = dCoinPatch < 9.0e4;
    bool hasFlatRing = dFlatRingPatch < 9.0e4;
    bool hasRing = dRingPatch < 9.0e4;
    float dCoinBand = abs(hostField(p)) - (uThickness * 0.5 + uCoinBulge);
    float plateFlat = 1e5;
    bool hasFlat = false;
    if (hasCoin) {
      plateFlat = opSmoothIntersection(dCoinBand, dCoinPatch, uRoundK);
      hasFlat = true;
    }
    if (hasFlatRing) {
      float plateFlatRing = opSmoothIntersection(dShell, dFlatRingPatch, uRoundK);
      plateFlat = hasFlat ? smoothMinG(plateFlat, plateFlatRing, uRoundK) : plateFlatRing;
      hasFlat = true;
    }
    if (!hasRing) return hasFlat ? plateFlat : 1e5;
    return hasFlat ? smoothMinG(plateFlat, dRingPatch, uRoundK) : dRingPatch;
  }

  vec3 estimateNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
      map(p + vec3(e, 0.0, 0.0)) - map(p - vec3(e, 0.0, 0.0)),
      map(p + vec3(0.0, e, 0.0)) - map(p - vec3(0.0, e, 0.0)),
      map(p + vec3(0.0, 0.0, e)) - map(p - vec3(0.0, 0.0, e))
    ));
  }

  // Nearest patch-point's owner index at a surface point -- used only for
  // the selection highlight.
  int nearestPatchOwner(vec3 p) {
    float best = 1e5;
    int bestOwner = -1;
    for (int i = 0; i < ${PATCH_MAX_POINTS}; i++) {
      if (i >= uPatchPointCount) break;
      float bd = sdBall(p, uPatchPos[i], uPatchData[i].x);
      if (bd < best) { best = bd; bestOwner = int(floor(uPatchData[i].y + 0.01)); }
    }
    return bestOwner;
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

    if (!hit || uHostCount == 0) {
      float g = 0.5 + 0.5 * vUv.y;
      gl_FragColor = vec4(mix(vec3(0.055, 0.06, 0.075), vec3(0.09, 0.1, 0.12), g), 1.0);
      return;
    }

    vec3 n = estimateNormal(p);
    float diff = max(dot(n, normalize(uLightDir)), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);

    // Distinguish a patch surface from bare shell. This split depends on
    // the mode: in WINDOW mode most of the shell has nothing to do with any
    // patch, so a fragment reads as "on a patch" only near a carved
    // opening's own rim (dPatch close to zero). In PLATE mode the composite
    // is shell ∩ patches, which is empty wherever no patch reaches -- so
    // ANY fragment reaching this point in plate mode is, by construction,
    // already inside some patch (typically deep inside its point spheres,
    // not near their own zero surface). Treating plate mode the same way
    // window mode does would leave plate faces uncolored except at their
    // very rim -- the CPU-side picking bug this Study's verification found
    // (click-to-select silently failing on plate faces) had the same root
    // cause; picking.ts's nearestPatchId documents the identical fix.
    float dPatchHere = uPatchPointCount > 0 ? patchField(p) : 1e5;
    bool onPatch = uMode == 0 ? uPatchPointCount > 0 : abs(dPatchHere) < 0.01;

    vec3 base = onPatch ? vec3(0.9, 0.72, 0.5) : vec3(0.86, 0.87, 0.9);
    vec3 color = base * (0.25 + 0.75 * diff) + rim * 0.15;

    if (uSelectedPatchOwner >= 0 && onPatch && nearestPatchOwner(p) == uSelectedPatchOwner) {
      color = mix(color, vec3(1.0, 0.75, 0.2), 0.5);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;
