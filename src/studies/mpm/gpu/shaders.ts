// ---------------------------------------------------------------------------
// WGSL compute kernels for S2c's WebGPU backend (T2e). Each shader is a
// standalone WGSL module (WGSL has no #include, so small helper functions --
// quadWeights, computeCauchyStress -- are duplicated between p2g.wgsl and
// g2p.wgsl rather than shared; kept in sync BY CONSTRUCTION with sim.ts's
// CPU reference -- see that file's doc comments for the physics this ports
// line-for-line. Read sim.ts first; this file assumes it).
//
// Design choices worth being explicit about (T2e §3, §"作るもの"):
//
// - P2G scatters into two atomic<i32> grid buffers (mass, momentum) using a
//   FIXED-POINT encoding (value * SCALE, rounded, added as an integer),
//   because WGSL/WebGPU has no atomicAdd for f32 (only i32/u32) -- this is
//   T2e's mandated standard approach, not a choice among alternatives. The
//   grid-update pass decodes back to f32 (divide by SCALE) once per cell,
//   after which the rest of the pipeline (g2p) works in plain f32, matching
//   the CPU path's math exactly except for that quantization step. The
//   scale (MASS_FIXED_SCALE / MOM_FIXED_SCALE, gpuSim.ts) is tuned to this
//   Study's sketch-scale magnitudes (masses ~0.1-10, momenta of similar
//   order) -- same "tuned, not universal" honesty pattern as sim.ts's
//   friction coefficient 0.7 or DT=1/6000.
// - Matrices (F, C) are stored in particle buffers as flat `array<f32,9>`
//   in ROW-MAJOR order -- i.e. byte-identical to mat3.ts's Mat3 flat array
//   (a[r*3+c]) -- so uploading/reading back a particle's F/C is a straight
//   memcpy from/to MpmParticle.F/C, no repacking. Inside the shader, a
//   `loadMat3`-style inline reconstructs a WGSL `mat3x3<f32>` (whose native
//   layout is column-major) from those 9 values so that `+`, `*`,
//   `transpose()`, `determinant()` all mean what they mean mathematically --
//   deliberately NOT relying on mat3x3's host-shareable memory layout for
//   storage-buffer packing (that would require getting WGSL's per-column
//   16-byte padding exactly right on both the WGSL and the JS-packing side;
//   flat f32 arrays with an explicit, hand-written load/store convention are
//   lower-risk and were chosen for that reason, at the cost of a few extra
//   scalar reads/writes per particle per pass).
// ---------------------------------------------------------------------------

export const WORKGROUP_SIZE = 64;

/** Shared struct + math prelude, textually duplicated into each module (see file header for why). */
const PRELUDE = /* wgsl */ `
struct SimParams {
  gridN: f32,
  dx: f32,
  invDx: f32,
  dt: f32,
  domainHalf: f32,
  domainSize: f32,
  bound: f32,
  phase: f32,
  youngsModulusPa: f32,
  poissonRatio: f32,
  fluidBulkModulusPa: f32,
  fluidViscosityPaS: f32,
  gravity: f32,
  particleCount: f32,
  massFixedScale: f32,
  momFixedScale: f32,
}

struct QW {
  base: i32,
  w0: f32,
  w1: f32,
  w2: f32,
  fx: f32,
}

fn identity3() -> mat3x3<f32> {
  return mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
}

/** Row-major flat 9 floats (matches mat3.ts's Mat3) -> WGSL mat3x3 (column-major natively, but the arithmetic operators/transpose()/determinant() are basis-independent as long as we're consistent -- see file header). */
fn loadMat3(a0: f32, a1: f32, a2: f32, a3: f32, a4: f32, a5: f32, a6: f32, a7: f32, a8: f32) -> mat3x3<f32> {
  return mat3x3<f32>(vec3<f32>(a0, a3, a6), vec3<f32>(a1, a4, a7), vec3<f32>(a2, a5, a8));
}

/** Quadratic B-spline base cell + per-axis weights -- direct port of sim.ts's quadraticWeights(). */
fn quadWeights(coord: f32, dx: f32) -> QW {
  let cell = coord / dx;
  let base = i32(floor(cell - 0.5));
  let fx = cell - f32(base);
  var out: QW;
  out.base = base;
  out.w0 = 0.5 * (1.5 - fx) * (1.5 - fx);
  out.w1 = 0.75 - (fx - 1.0) * (fx - 1.0);
  out.w2 = 0.5 * (fx - 0.5) * (fx - 0.5);
  out.fx = fx;
  return out;
}

/** Direct port of sim.ts's computeCauchyStress -- see that file for the citations and the honesty notes on the simplifications (gamma=1 EOS, missing deviatoric trace term, F isotropic blend handled separately in G2P). */
fn computeCauchyStress(F: mat3x3<f32>, C: mat3x3<f32>, phase: f32, youngsModulusPa: f32, poissonRatio: f32, fluidBulkModulusPa: f32, fluidViscosityPaS: f32) -> mat3x3<f32> {
  let I = identity3();
  let J = max(determinant(F), 1e-6);
  let mu = youngsModulusPa / (2.0 * (1.0 + poissonRatio));
  let lambda = (youngsModulusPa * poissonRatio) / ((1.0 + poissonRatio) * (1.0 - 2.0 * poissonRatio));
  let Ft = transpose(F);
  let FFt = F * Ft;
  let solid = (FFt - I) * (mu / J) + I * ((lambda / J) * log(J));

  let pressure = fluidBulkModulusPa * (1.0 / J - 1.0);
  let D = (C + transpose(C)) * 0.5;
  let fluid = I * (-pressure) + D * (2.0 * fluidViscosityPaS);

  return solid + (fluid - solid) * phase;
}
`;

/** Zero the two atomic grid accumulators before each substep's P2G (sim.ts's clearGrid()). Dispatched over max(mass length, vel length) = vel length (3x). */
export const CLEAR_GRID_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> gridMassFixed: array<atomic<i32>>;
@group(0) @binding(1) var<storage, read_write> gridVelFixed: array<atomic<i32>>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i < arrayLength(&gridMassFixed)) {
    atomicStore(&gridMassFixed[i], 0);
  }
  if (i < arrayLength(&gridVelFixed)) {
    atomicStore(&gridVelFixed[i], 0);
  }
}
`;

/** P2G: scatter mass + momentum + stress-force into the grid (sim.ts's substep(), "P2G" section). One thread per particle. */
export const P2G_WGSL =
  PRELUDE +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> posBuf: array<f32>;
@group(0) @binding(2) var<storage, read> velBuf: array<f32>;
@group(0) @binding(3) var<storage, read> FBuf: array<f32>;
@group(0) @binding(4) var<storage, read> CBuf: array<f32>;
@group(0) @binding(5) var<storage, read> massBuf: array<f32>;
@group(0) @binding(6) var<storage, read> vol0Buf: array<f32>;
@group(0) @binding(7) var<storage, read_write> gridMassFixed: array<atomic<i32>>;
@group(0) @binding(8) var<storage, read_write> gridVelFixed: array<atomic<i32>>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pid = gid.x;
  if (pid >= u32(params.particleCount)) {
    return;
  }
  let dx = params.dx;
  let invDx = params.invDx;
  let n = i32(params.gridN);

  let px = posBuf[pid * 3u + 0u];
  let py = posBuf[pid * 3u + 1u];
  let pz = posBuf[pid * 3u + 2u];
  let vx = velBuf[pid * 3u + 0u];
  let vy = velBuf[pid * 3u + 1u];
  let vz = velBuf[pid * 3u + 2u];
  let mass = massBuf[pid];
  let vol0 = vol0Buf[pid];

  let fo = pid * 9u;
  let F = loadMat3(FBuf[fo], FBuf[fo + 1u], FBuf[fo + 2u], FBuf[fo + 3u], FBuf[fo + 4u], FBuf[fo + 5u], FBuf[fo + 6u], FBuf[fo + 7u], FBuf[fo + 8u]);
  let C = loadMat3(CBuf[fo], CBuf[fo + 1u], CBuf[fo + 2u], CBuf[fo + 3u], CBuf[fo + 4u], CBuf[fo + 5u], CBuf[fo + 6u], CBuf[fo + 7u], CBuf[fo + 8u]);

  let stress = computeCauchyStress(F, C, params.phase, params.youngsModulusPa, params.poissonRatio, params.fluidBulkModulusPa, params.fluidViscosityPaS);
  let Jf = max(determinant(F), 1e-6);
  let kirchhoff = stress * Jf;
  let stressTerm = kirchhoff * (-params.dt * vol0 * 4.0 * invDx * invDx);
  let affine = stressTerm + C * mass;

  let wx = quadWeights(px + params.domainHalf, dx);
  let wy = quadWeights(py, dx);
  let wz = quadWeights(pz + params.domainHalf, dx);
  let wx012 = array<f32, 3>(wx.w0, wx.w1, wx.w2);
  let wy012 = array<f32, 3>(wy.w0, wy.w1, wy.w2);
  let wz012 = array<f32, 3>(wz.w0, wz.w1, wz.w2);

  for (var i = 0; i < 3; i = i + 1) {
    let gi = wx.base + i;
    if (gi < 0 || gi >= n) { continue; }
    for (var j = 0; j < 3; j = j + 1) {
      let gj = wy.base + j;
      if (gj < 0 || gj >= n) { continue; }
      for (var k = 0; k < 3; k = k + 1) {
        let gk = wz.base + k;
        if (gk < 0 || gk >= n) { continue; }
        let weight = wx012[i] * wy012[j] * wz012[k];
        if (weight <= 0.0) { continue; }
        let dpos = vec3<f32>((f32(i) - wx.fx) * dx, (f32(j) - wy.fx) * dx, (f32(k) - wz.fx) * dx);
        let affContrib = affine * dpos;
        let idx = (u32(gi) * u32(n) + u32(gj)) * u32(n) + u32(gk);
        let massContrib = weight * mass;

        atomicAdd(&gridMassFixed[idx], i32(round(massContrib * params.massFixedScale)));
        let mvx = massContrib * vx + weight * affContrib.x;
        let mvy = massContrib * vy + weight * affContrib.y;
        let mvz = massContrib * vz + weight * affContrib.z;
        atomicAdd(&gridVelFixed[idx * 3u + 0u], i32(round(mvx * params.momFixedScale)));
        atomicAdd(&gridVelFixed[idx * 3u + 1u], i32(round(mvy * params.momFixedScale)));
        atomicAdd(&gridVelFixed[idx * 3u + 2u], i32(round(mvz * params.momFixedScale)));
      }
    }
  }
}
`;

/** Grid update: momentum -> velocity (decode fixed-point), gravity, boundary conditions (sim.ts's substep(), "Grid update" section). One thread per cell. */
export const GRID_UPDATE_WGSL =
  PRELUDE +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> params: SimParams;
// WGSL requires atomic storage variables to be read_write even when the
// shader only ever calls atomicLoad on them (Tint's validator rejects a
// plain read-only access mode on an atomic storage binding) -- discovered
// via a pushErrorScope() investigation during this port (README's
// Observation has the full story, alongside the params->uniform fix above
// this file's PRELUDE, both hit in the same debugging session).
@group(0) @binding(1) var<storage, read_write> gridMassFixed: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read_write> gridVelFixed: array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> gridVelOut: array<f32>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(params.gridN);
  let n3 = u32(n * n * n);
  let idx = gid.x;
  if (idx >= n3) {
    return;
  }

  let massFixed = atomicLoad(&gridMassFixed[idx]);
  let m = f32(massFixed) / params.massFixedScale;
  if (m <= 0.0) {
    gridVelOut[idx * 3u + 0u] = 0.0;
    gridVelOut[idx * 3u + 1u] = 0.0;
    gridVelOut[idx * 3u + 2u] = 0.0;
    return;
  }
  let mvx = f32(atomicLoad(&gridVelFixed[idx * 3u + 0u])) / params.momFixedScale;
  let mvy = f32(atomicLoad(&gridVelFixed[idx * 3u + 1u])) / params.momFixedScale;
  let mvz = f32(atomicLoad(&gridVelFixed[idx * 3u + 2u])) / params.momFixedScale;
  var vx = mvx / m;
  var vy = mvy / m;
  var vz = mvz / m;
  vy = vy - params.gravity * params.dt;

  // Decompose idx back into i,j,k -- matches sim.ts's cellIndex() = (i*n+j)*n+k.
  let bound = i32(params.bound);
  let k = i32(idx % u32(n));
  let rem = idx / u32(n);
  let j = i32(rem % u32(n));
  let i = i32(rem / u32(n));

  if (i < bound && vx < 0.0) { vx = 0.0; }
  if (i > n - 1 - bound && vx > 0.0) { vx = 0.0; }
  if (k < bound && vz < 0.0) { vz = 0.0; }
  if (k > n - 1 - bound && vz > 0.0) { vz = 0.0; }
  if (j < bound) {
    if (vy < 0.0) { vy = 0.0; }
    vx = vx * 0.7;
    vz = vz * 0.7;
  }
  if (j > n - 1 - bound && vy > 0.0) { vy = 0.0; }

  gridVelOut[idx * 3u + 0u] = vx;
  gridVelOut[idx * 3u + 1u] = vy;
  gridVelOut[idx * 3u + 2u] = vz;
}
`;

/** G2P: gather velocity + affine gradient C, advect position, update F (sim.ts's substep(), "G2P" section, including the phase-blended isotropic F and the domain-clamp safety backstop). One thread per particle. */
export const G2P_WGSL =
  PRELUDE +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> posBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> velBuf: array<f32>;
@group(0) @binding(3) var<storage, read_write> FBuf: array<f32>;
@group(0) @binding(4) var<storage, read_write> CBuf: array<f32>;
@group(0) @binding(5) var<storage, read> gridVelOut: array<f32>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pid = gid.x;
  if (pid >= u32(params.particleCount)) {
    return;
  }
  let dx = params.dx;
  let invDx = params.invDx;
  let n = i32(params.gridN);

  var px = posBuf[pid * 3u + 0u];
  var py = posBuf[pid * 3u + 1u];
  var pz = posBuf[pid * 3u + 2u];

  let wx = quadWeights(px + params.domainHalf, dx);
  let wy = quadWeights(py, dx);
  let wz = quadWeights(pz + params.domainHalf, dx);
  let wx012 = array<f32, 3>(wx.w0, wx.w1, wx.w2);
  let wy012 = array<f32, 3>(wy.w0, wy.w1, wy.w2);
  let wz012 = array<f32, 3>(wz.w0, wz.w1, wz.w2);

  var nvx = 0.0;
  var nvy = 0.0;
  var nvz = 0.0;
  var C = mat3x3<f32>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));

  for (var i = 0; i < 3; i = i + 1) {
    let gi = wx.base + i;
    if (gi < 0 || gi >= n) { continue; }
    for (var j = 0; j < 3; j = j + 1) {
      let gj = wy.base + j;
      if (gj < 0 || gj >= n) { continue; }
      for (var k = 0; k < 3; k = k + 1) {
        let gk = wz.base + k;
        if (gk < 0 || gk >= n) { continue; }
        let weight = wx012[i] * wy012[j] * wz012[k];
        if (weight <= 0.0) { continue; }
        let idx = (u32(gi) * u32(n) + u32(gj)) * u32(n) + u32(gk);
        let gv = vec3<f32>(gridVelOut[idx * 3u + 0u], gridVelOut[idx * 3u + 1u], gridVelOut[idx * 3u + 2u]);
        nvx = nvx + weight * gv.x;
        nvy = nvy + weight * gv.y;
        nvz = nvz + weight * gv.z;
        let dpos = vec3<f32>((f32(i) - wx.fx) * dx, (f32(j) - wy.fx) * dx, (f32(k) - wz.fx) * dx);
        let scale = weight * 4.0 * invDx * invDx;
        // Outer product gv (x) dpos, matching mat3.ts's mat3Outer(v,w): M(r,c) = v[r]*w[c].
        // Columns of the WGSL matrix are gv scaled by each dpos component.
        let outer = mat3x3<f32>(gv * dpos.x, gv * dpos.y, gv * dpos.z);
        C = C + outer * scale;
      }
    }
  }

  let fo = pid * 9u;
  CBuf[fo] = C[0].x; CBuf[fo + 3u] = C[0].y; CBuf[fo + 6u] = C[0].z;
  CBuf[fo + 1u] = C[1].x; CBuf[fo + 4u] = C[1].y; CBuf[fo + 7u] = C[1].z;
  CBuf[fo + 2u] = C[2].x; CBuf[fo + 5u] = C[2].y; CBuf[fo + 8u] = C[2].z;

  px = px + nvx * params.dt;
  py = py + nvy * params.dt;
  pz = pz + nvz * params.dt;

  let Fold = loadMat3(FBuf[fo], FBuf[fo + 1u], FBuf[fo + 2u], FBuf[fo + 3u], FBuf[fo + 4u], FBuf[fo + 5u], FBuf[fo + 6u], FBuf[fo + 7u], FBuf[fo + 8u]);
  let I = identity3();
  let Fraw = (I + C * params.dt) * Fold;
  let Jf = max(determinant(Fraw), 1e-6);
  let isoScale = pow(Jf, 1.0 / 3.0);
  let Fiso = I * isoScale;
  let Fnew = Fraw + (Fiso - Fraw) * params.phase;

  FBuf[fo] = Fnew[0].x; FBuf[fo + 3u] = Fnew[0].y; FBuf[fo + 6u] = Fnew[0].z;
  FBuf[fo + 1u] = Fnew[1].x; FBuf[fo + 4u] = Fnew[1].y; FBuf[fo + 7u] = Fnew[1].z;
  FBuf[fo + 2u] = Fnew[2].x; FBuf[fo + 5u] = Fnew[2].y; FBuf[fo + 8u] = Fnew[2].z;

  // Safety clamp, same as sim.ts's G2P tail: keep particles inside the grid's
  // actual domain and zero the outward velocity component if clamped.
  let margin = f32(params.bound) * dx;
  var vxOut = nvx;
  var vyOut = nvy;
  var vzOut = nvz;
  if (px < -params.domainHalf + margin) { px = -params.domainHalf + margin; if (vxOut < 0.0) { vxOut = 0.0; } }
  if (px > params.domainHalf - margin) { px = params.domainHalf - margin; if (vxOut > 0.0) { vxOut = 0.0; } }
  if (pz < -params.domainHalf + margin) { pz = -params.domainHalf + margin; if (vzOut < 0.0) { vzOut = 0.0; } }
  if (pz > params.domainHalf - margin) { pz = params.domainHalf - margin; if (vzOut > 0.0) { vzOut = 0.0; } }
  if (py < margin) { py = margin; if (vyOut < 0.0) { vyOut = 0.0; } }
  if (py > params.domainSize - margin) { py = params.domainSize - margin; if (vyOut > 0.0) { vyOut = 0.0; } }

  posBuf[pid * 3u + 0u] = px;
  posBuf[pid * 3u + 1u] = py;
  posBuf[pid * 3u + 2u] = pz;
  velBuf[pid * 3u + 0u] = vxOut;
  velBuf[pid * 3u + 1u] = vyOut;
  velBuf[pid * 3u + 2u] = vzOut;
}
`;
