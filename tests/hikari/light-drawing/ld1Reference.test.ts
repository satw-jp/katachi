import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  LD1_CONTRACT,
  LD1_DEFAULT_EXIT_SURFACE_MODE,
  LD1_DEFAULT_FORM,
  LD1_EXIT_SURFACE_PRESETS,
  LD1_FORM_PRESETS,
  LD1_GEOMETRY,
  LD1_RAY_DIAGRAM_DOMAIN,
  LD1_RECONSTRUCTION_RADIUS_TEXELS,
  LD1_RIDGE_BEND_RANGE,
  LD1_RIDGE_POSITION_RANGE,
  LD1_SUPPORT_EXPANSION_TEXELS,
  classifyExitTerminal,
  countSupportClippedTexels,
  intersectLowerSurface,
  lowerSurfaceAndGradient,
  lowerSurfaceNormal,
  makeLd1Config,
  mapLd1RayDiagramX,
  mapLd1RayDiagramY,
  physicalDisplayRgb,
  refractSnell,
  reliefAndGradient,
  runLd1Reference,
  upperSurfaceNormal,
  type Ld1Form,
  type Ld1ExitSurfaceMode,
} from "../../../src/studies/cloud-sculpt/lightDrawing/ld1Reference.ts";
import {
  applyShadowContainedSupport,
  blurFluxRgbEnergyNormalized,
  createReceiverTransportField,
  integrateFluxRgb,
  splatBilinearFluxRgb,
} from "../../../src/studies/cloud-sculpt/receiverTransport.ts";

const compact = { sampleCount: 768, fieldWidth: 64, fieldHeight: 64 };
const floatHash = (values: Float32Array): string => createHash("sha256").update(Buffer.from(values.buffer, values.byteOffset, values.byteLength)).digest("hex");

test("OPT-LD-1 READINESS / CANDIDATE has fixed CPU-only contract values", () => {
  assert.equal(LD1_CONTRACT.sourceAngularRadiusDegrees, .53);
  assert.equal(LD1_CONTRACT.ior, 1.49);
  assert.equal(LD1_RECONSTRUCTION_RADIUS_TEXELS, 2);
  assert.equal(LD1_SUPPORT_EXPANSION_TEXELS, 3);
  assert.match(LD1_CONTRACT.scope, /CPU-ONLY/);
  assert.match(LD1_CONTRACT.warning, /NOT OPT-LD-1 GO OR ACCEPTANCE/);
});

test("the deterministic relief changes real upper height and thickness, not only normals", () => {
  const flat = reliefAndGradient(.18, -.09, 0);
  const bulged = reliefAndGradient(.18, -.09, .18);
  assert.deepEqual(flat, { relief: 0, gradientX: 0, gradientZ: 0 });
  assert.ok(bulged.relief > 0);
  assert.ok(Math.abs(bulged.gradientX) + Math.abs(bulged.gradientZ) > 0);
});

test("connected-ridge gesture controls have strict finite bounds and neutral defaults", () => {
  assert.deepEqual(LD1_RIDGE_POSITION_RANGE, { min: -.18, max: .18 });
  assert.deepEqual(LD1_RIDGE_BEND_RANGE, { min: -.20, max: .20 });
  assert.equal(makeLd1Config().ridgePosition, 0);
  assert.equal(makeLd1Config().ridgeBend, 0);
  for (const ridgePosition of [-Infinity, NaN, -.181, .181]) assert.throws(() => makeLd1Config({ ridgePosition }), RangeError);
  for (const ridgeBend of [-Infinity, NaN, -.201, .201]) assert.throws(() => makeLd1Config({ ridgeBend }), RangeError);
  assert.equal(makeLd1Config({ ridgePosition: -.18, ridgeBend: .20 }).ridgePosition, -.18);
});

test("neutral connected-ridge controls retain captured relief and receiver hashes exactly", () => {
  const point = [.31, -.12, .24, "connected-ridge"] as const;
  assert.deepEqual(reliefAndGradient(...point), reliefAndGradient(...point, 0, 0));
  const neutral = runLd1Reference({ ...compact, form: "connected-ridge", exitSurfaceMode: "opposing" });
  const explicit = runLd1Reference({ ...compact, form: "connected-ridge", exitSurfaceMode: "opposing", ridgePosition: 0, ridgeBend: 0 });
  assert.equal(floatHash(neutral.on.rawField.depositedFluxRgb), floatHash(explicit.on.rawField.depositedFluxRgb));
  assert.equal(floatHash(neutral.on.field.depositedFluxRgb), floatHash(explicit.on.field.depositedFluxRgb));
});

test("ridge gesture gradients are analytic, amplitude-zero is exact, and other forms ignore controls", () => {
  const h = 1e-5;
  for (const [ridgePosition, ridgeBend] of [[-.18, -.20], [0, 0], [.18, .20]]) for (const [x, z] of [[-.47, .31], [.19, -.28], [.62, .08]]) {
    const analytic = reliefAndGradient(x, z, .24, "connected-ridge", ridgePosition, ridgeBend);
    const numericalX = (reliefAndGradient(x + h, z, .24, "connected-ridge", ridgePosition, ridgeBend).relief - reliefAndGradient(x - h, z, .24, "connected-ridge", ridgePosition, ridgeBend).relief) / (2 * h);
    const numericalZ = (reliefAndGradient(x, z + h, .24, "connected-ridge", ridgePosition, ridgeBend).relief - reliefAndGradient(x, z - h, .24, "connected-ridge", ridgePosition, ridgeBend).relief) / (2 * h);
    assert.ok(Math.abs(analytic.gradientX - numericalX) < 3e-6, `gesture gradientX at ${x}, ${z}`);
    assert.ok(Math.abs(analytic.gradientZ - numericalZ) < 3e-6, `gesture gradientZ at ${x}, ${z}`);
  }
  assert.deepEqual(reliefAndGradient(.2, -.1, 0, "connected-ridge", .18, -.20), { relief: 0, gradientX: 0, gradientZ: 0 });
  for (const form of ["single-bulge", "pinch-valley"] as const) {
    assert.deepEqual(reliefAndGradient(.2, -.1, .24, form), reliefAndGradient(.2, -.1, .24, form, .18, -.20));
    const baseline = runLd1Reference({ ...compact, form, exitSurfaceMode: "opposing" });
    const gestured = runLd1Reference({ ...compact, form, exitSurfaceMode: "opposing", ridgePosition: .18, ridgeBend: -.20 });
    assert.deepEqual([...gestured.on.field.depositedFluxRgb], [...baseline.on.field.depositedFluxRgb]);
  }
});

test("the finite form vocabulary enumerates three forms and preserves single-bulge default compatibility", () => {
  assert.deepEqual(LD1_FORM_PRESETS.map((preset) => preset.value), ["single-bulge", "connected-ridge", "pinch-valley"]);
  assert.equal(LD1_DEFAULT_FORM, "single-bulge");
  assert.equal(makeLd1Config().form, "single-bulge");
  const point = [.23, -.17, .19] as const;
  assert.deepEqual(reliefAndGradient(...point), reliefAndGradient(...point, "single-bulge"));
  assert.deepEqual(upperSurfaceNormal(...point), upperSurfaceNormal(...point, "single-bulge"));
  assert.throws(() => makeLd1Config({ form: "not-a-form" as Ld1Form }), RangeError);
});

test("every form has a finite analytic gradient matching bounded numerical differences", () => {
  const h = 1e-5;
  for (const form of LD1_FORM_PRESETS.map((preset) => preset.value)) for (const [x, z] of [[-.47, .31], [.19, -.28], [.62, .08]]) {
    const analytic = reliefAndGradient(x, z, .24, form);
    const numericalX = (reliefAndGradient(x + h, z, .24, form).relief - reliefAndGradient(x - h, z, .24, form).relief) / (2 * h);
    const numericalZ = (reliefAndGradient(x, z + h, .24, form).relief - reliefAndGradient(x, z - h, .24, form).relief) / (2 * h);
    assert.ok(Number.isFinite(analytic.relief + analytic.gradientX + analytic.gradientZ));
    assert.ok(Math.abs(analytic.gradientX - numericalX) < 3e-6, `${form} gradientX at ${x}, ${z}`);
    assert.ok(Math.abs(analytic.gradientZ - numericalZ) < 3e-6, `${form} gradientZ at ${x}, ${z}`);
  }
});

test("the far-surface vocabulary is finite, flat by default, and flat keeps the captured reference bytes", () => {
  assert.deepEqual(LD1_EXIT_SURFACE_PRESETS.map((preset) => preset.value), ["flat", "following", "opposing"]);
  assert.equal(LD1_DEFAULT_EXIT_SURFACE_MODE, "flat");
  assert.equal(makeLd1Config().exitSurfaceMode, "flat");
  assert.throws(() => makeLd1Config({ exitSurfaceMode: "invented" as Ld1ExitSurfaceMode }), RangeError);
  const expected = {
    "single-bulge": ["338bcde975c1cbba7a5a44327fd88d32fb0363547e089522c4c4aaf5b3bb6701", "73e8c16ab41f289a06d75ef2af02a0f10b6da54da3fd12d0bbfddabae6863dbb", "a0f14f9de0246374ba633bbc511afc156508be60d4331219a54220fb04baafa3"],
    "connected-ridge": ["467b21cd749d72f591ceb09f57822c3203f39a70632ab9ea5634c401406fc6a5", "e227370aa1b5cd4a3b383897013f7d84449d13efada1018f1f17b30069f3715f", "ae165e7395802bcb97aece65028c986156066a5bbaeea001a3068313eeb7a228"],
    "pinch-valley": ["097a179b4d75986c3172acc3b18918a84a3ffc4500768d5b541e29c17e8f1b46", "92a84c024c879057854bf280644b05abd480ebb287ef532d4fc28004024f66b1", "87b663c1c9837b7bba83ed9128bc18499a4deb99a40f039f45f3c6093ff758bb"],
  } as const;
  for (const form of LD1_FORM_PRESETS.map((preset) => preset.value)) {
    const result = runLd1Reference({ form, exitSurfaceMode: "flat" });
    assert.equal(floatHash(result.off.rawField.depositedFluxRgb), "59347a5e3f1893ca34130526774f997a6bee61e366d6430dab16c96adbf94417");
    assert.equal(floatHash(result.off.field.depositedFluxRgb), "78bb7517d9035b5f8c000ecb8d7bfbe77d1e5af99dea08f1d0ef463ed8fb5304");
    assert.deepEqual([floatHash(result.on.rawField.depositedFluxRgb), floatHash(result.on.field.depositedFluxRgb), floatHash(result.signedDifference)], expected[form]);
  }
});

test("far surfaces have analytic gradients, bounded intersections, and upward incident-side normals", () => {
  const h = 1e-5;
  for (const form of LD1_FORM_PRESETS.map((preset) => preset.value)) for (const mode of LD1_EXIT_SURFACE_PRESETS.map((preset) => preset.value)) {
    const x=.21,z=-.17,amplitude=.24;
    const analytic=lowerSurfaceAndGradient(x,z,amplitude,form,mode);
    const numericalX=(lowerSurfaceAndGradient(x+h,z,amplitude,form,mode).height-lowerSurfaceAndGradient(x-h,z,amplitude,form,mode).height)/(2*h);
    const numericalZ=(lowerSurfaceAndGradient(x,z+h,amplitude,form,mode).height-lowerSurfaceAndGradient(x,z-h,amplitude,form,mode).height)/(2*h);
    assert.ok(Math.abs(analytic.gradientX-numericalX)<3e-6,`${form}/${mode} lower gradientX`);
    assert.ok(Math.abs(analytic.gradientZ-numericalZ)<3e-6,`${form}/${mode} lower gradientZ`);
    const normal=lowerSurfaceNormal(x,z,amplitude,form,mode);
    assert.ok(normal.y>0 && Math.abs(Math.hypot(normal.x,normal.y,normal.z)-1)<1e-12);
    const hit=intersectLowerSurface({x:.1,y:.42,z:-.08},{x:.07,y:-.99,z:.04},amplitude,form,mode);
    assert.equal(hit.kind,"hit",`${form}/${mode} lower hit`);
    if(hit.kind==="hit")assert.ok(hit.residual<=1e-8);
  }
  const invalid=intersectLowerSurface({x:0,y:.4,z:0},{x:1,y:0,z:0},.2,"single-bulge","following");
  assert.equal(invalid.kind,"invalid");
});

test("all form/mode pairs stay separated, clear the receiver, and expose honest vertical thickness", () => {
  const amplitude=LD1_GEOMETRY.maxBulgeAmplitude;
  for(const form of LD1_FORM_PRESETS.map((preset)=>preset.value))for(const mode of LD1_EXIT_SURFACE_PRESETS.map((preset)=>preset.value))for(let x=-1.08;x<=1.08;x+=.03)for(let z=-1.08;z<=1.08;z+=.03){
    const upper=LD1_GEOMETRY.baseTopY+reliefAndGradient(x,z,amplitude,form).relief;
    const lower=lowerSurfaceAndGradient(x,z,amplitude,form,mode).height;
    assert.ok(upper-lower>0,`${form}/${mode} separation at ${x},${z}`);
    assert.ok(lower>LD1_CONTRACT.receiverY,`${form}/${mode} receiver clearance at ${x},${z}`);
  }
  for(const form of LD1_FORM_PRESETS.map((preset)=>preset.value)){
    const following=runLd1Reference({...compact,form,exitSurfaceMode:"following"});
    assert.ok(following.profile.every((point)=>Math.abs(point.thickness-LD1_GEOMETRY.baseTopY)<1e-12));
    const flat=runLd1Reference({...compact,form,exitSurfaceMode:"flat"});
    const opposing=runLd1Reference({...compact,form,exitSurfaceMode:"opposing"});
    const range=(values:number[])=>Math.max(...values)-Math.min(...values);
    assert.ok(Math.abs(range(opposing.profile.map((p)=>p.thickness))-1.5*range(flat.profile.map((p)=>p.thickness)))<1e-12);
  }
});

test("connected-ridge gesture bounds retain separation, clearance, finite intersections, containment, and closure", () => {
  const amplitude = LD1_GEOMETRY.maxBulgeAmplitude;
  for (const ridgePosition of [LD1_RIDGE_POSITION_RANGE.min, LD1_RIDGE_POSITION_RANGE.max]) for (const ridgeBend of [LD1_RIDGE_BEND_RANGE.min, LD1_RIDGE_BEND_RANGE.max]) {
    for (let x = -1.08; x <= 1.08; x += .03) for (let z = -1.08; z <= 1.08; z += .03) {
      const upper = LD1_GEOMETRY.baseTopY + reliefAndGradient(x, z, amplitude, "connected-ridge", ridgePosition, ridgeBend).relief;
      const lower = lowerSurfaceAndGradient(x, z, amplitude, "connected-ridge", "opposing", ridgePosition, ridgeBend).height;
      assert.ok(upper - lower > 0, `gesture separation at ${ridgePosition},${ridgeBend},${x},${z}`);
      assert.ok(lower > LD1_CONTRACT.receiverY, `gesture clearance at ${ridgePosition},${ridgeBend},${x},${z}`);
    }
    const result = runLd1Reference({ form: "connected-ridge", exitSurfaceMode: "opposing", bulgeAmplitude: amplitude, ridgePosition, ridgeBend });
    assert.equal(result.on.ledger.invalidCount, 0, `no invalid canonical paths at ${ridgePosition},${ridgeBend}`);
    assert.equal(result.on.supportLeakage, 0);
    for (const ray of result.on.representative) if (ray.inside) {
      const lower = lowerSurfaceAndGradient(ray.inside.to.x, ray.inside.to.z, amplitude, "connected-ridge", "opposing", ridgePosition, ridgeBend);
      assert.ok(Number.isFinite(lower.height + lower.gradientX + lower.gradientZ));
      assert.ok(Math.abs(ray.inside.to.y - lower.height) < 1e-8);
    }
    for (const channel of ["r", "g", "b"] as const) {
      const ledger = result.on.ledger;
      assert.ok(Math.abs(ledger.input[channel] - ledger.reflected[channel] - ledger.absorbed[channel] - ledger.deposited[channel] - ledger.escaped[channel] - ledger.tir[channel] - ledger.unresolved[channel]) < 2e-8);
    }
  }
});

test("connected-ridge position has deterministic canonical brightest-core continuity", () => {
  const sweep = { sampleCount: 192, fieldWidth: 32, fieldHeight: 32, form: "connected-ridge" as const, exitSurfaceMode: "opposing" as const, bulgeAmplitude: .18 };
  const values = (min: number, max: number) => Array.from({ length: Math.round((max - min) / .01) + 1 }, (_, index) => Number((min + index * .01).toFixed(2)));
  const normalizedL1 = (a: Float32Array, b: Float32Array) => {
    let total = 0, difference = 0;
    for (let i = 0; i < a.length; i++) { total += Math.abs(a[i]) + Math.abs(b[i]); difference += Math.abs(a[i] - b[i]); }
    return difference / total;
  };
  const brightestCoreCentroid = (result: ReturnType<typeof runLd1Reference>) => {
    const field = result.on.field;
    const texels = Array.from({ length: field.width * field.height }, (_, index) => {
      const offset = index * 3;
      return { index, weight: field.depositedFluxRgb[offset] + field.depositedFluxRgb[offset + 1] + field.depositedFluxRgb[offset + 2] };
    }).sort((a, b) => b.weight - a.weight || a.index - b.index).slice(0, Math.floor(.10 * field.width * field.height));
    let weight = 0, u = 0, v = 0;
    for (const texel of texels) {
      const x = texel.index % field.width, y = Math.floor(texel.index / field.width);
      const centerU = field.minU + (x + .5) * field.sizeU / field.width;
      const centerV = field.minV + (y + .5) * field.sizeV / field.height;
      weight += texel.weight; u += centerU * texel.weight; v += centerV * texel.weight;
    }
    return { u: u / weight, v: v / weight };
  };
  const canonical = { form: "connected-ridge" as const, exitSurfaceMode: "opposing" as const, bulgeAmplitude: .18, ridgeBend: 0 };
  const positions = values(LD1_RIDGE_POSITION_RANGE.min, LD1_RIDGE_POSITION_RANGE.max);
  const positionResults = positions.map((ridgePosition) => runLd1Reference({ ...canonical, ridgePosition }));
  const coreCentroids = positionResults.map(brightestCoreCentroid);
  assert.ok(normalizedL1(positionResults[0].on.field.depositedFluxRgb, positionResults.at(-1)!.on.field.depositedFluxRgb) > .25);
  assert.ok(Math.hypot(coreCentroids.at(-1)!.u - coreCentroids[0].u, coreCentroids.at(-1)!.v - coreCentroids[0].v) > .05);
  for (let index = 1; index < positionResults.length; index++) {
    assert.ok(normalizedL1(positionResults[index - 1].on.field.depositedFluxRgb, positionResults[index].on.field.depositedFluxRgb) <= .05);
    assert.ok(Math.hypot(coreCentroids[index].u - coreCentroids[index - 1].u, coreCentroids[index].v - coreCentroids[index - 1].v) <= .015);
  }
  const bendEndpoints = [LD1_RIDGE_BEND_RANGE.min, LD1_RIDGE_BEND_RANGE.max].map((ridgeBend) => runLd1Reference({ ...canonical, ridgePosition: 0, ridgeBend }));
  assert.ok(normalizedL1(bendEndpoints[0].on.field.depositedFluxRgb, bendEndpoints[1].on.field.depositedFluxRgb) > .03);
  const replay = runLd1Reference({ ...sweep, ridgePosition: .08, ridgeBend: -.11 });
  const repeated = runLd1Reference({ ...sweep, ridgePosition: .08, ridgeBend: -.11 });
  assert.deepEqual([...replay.on.field.depositedFluxRgb], [...repeated.on.field.depositedFluxRgb]);
});

test("zero amplitude is byte-identical across far surfaces; nonzero modes replay deterministically and differ", () => {
  for(const form of LD1_FORM_PRESETS.map((preset)=>preset.value)){
    const zero=LD1_EXIT_SURFACE_PRESETS.map((preset)=>runLd1Reference({...compact,form,exitSurfaceMode:preset.value,bulgeAmplitude:0}));
    for(const result of zero.slice(1)){
      assert.deepEqual([...result.on.rawField.depositedFluxRgb],[...zero[0].on.rawField.depositedFluxRgb]);
      assert.deepEqual([...result.on.field.depositedFluxRgb],[...zero[0].on.field.depositedFluxRgb]);
    }
    const modes=new Map(LD1_EXIT_SURFACE_PRESETS.map((preset)=>[preset.value,runLd1Reference({...compact,form,exitSurfaceMode:preset.value})]));
    for(const mode of LD1_EXIT_SURFACE_PRESETS.map((preset)=>preset.value)){
      const replay=runLd1Reference({...compact,form,exitSurfaceMode:mode});
      assert.deepEqual([...replay.on.field.depositedFluxRgb],[...modes.get(mode)!.on.field.depositedFluxRgb]);
    }
    const hashes=LD1_EXIT_SURFACE_PRESETS.map((preset)=>floatHash(modes.get(preset.value)!.on.rawField.depositedFluxRgb));
    assert.equal(new Set(hashes).size,hashes.length,`${form} mode-distinct receiver results`);
  }
});

test("every form/mode representative ends on the analytic far surface and terminal energy closes", () => {
  for(const form of LD1_FORM_PRESETS.map((preset)=>preset.value))for(const mode of LD1_EXIT_SURFACE_PRESETS.map((preset)=>preset.value)){
    const result=runLd1Reference({...compact,form,exitSurfaceMode:mode});
    for(const ray of result.on.representative){
      if(!ray.inside)continue;
      const lower=lowerSurfaceAndGradient(ray.inside.to.x,ray.inside.to.z,result.config.bulgeAmplitude,form,mode);
      assert.ok(Math.abs(ray.inside.to.y-lower.height)<1e-8,`${form}/${mode} representative lower hit`);
    }
    for(const scenario of [result.off,result.on]){
      const f=scenario.ledger;
      assert.equal(f.deliveredCount+f.escapedCount+f.tirCount+f.missCount+f.invalidCount,f.inputCount);
      for(const channel of ["r","g","b"] as const)assert.ok(Math.abs(f.input[channel]-f.reflected[channel]-f.absorbed[channel]-f.deposited[channel]-f.escaped[channel]-f.tir[channel]-f.unresolved[channel])<2e-8,`${form}/${mode}/${channel} closure`);
    }
  }
});

test("OFF is pixel-identical across forms and amplitude-zero ON exactly matches OFF", () => {
  const results = LD1_FORM_PRESETS.map((preset) => runLd1Reference({ ...compact, form: preset.value }));
  for (const result of results.slice(1)) {
    assert.deepEqual([...result.off.rawField.depositedFluxRgb], [...results[0].off.rawField.depositedFluxRgb]);
    assert.deepEqual([...result.off.field.depositedFluxRgb], [...results[0].off.field.depositedFluxRgb]);
  }
  for (const preset of LD1_FORM_PRESETS) {
    const zero = runLd1Reference({ ...compact, form: preset.value, bulgeAmplitude: 0 });
    assert.deepEqual([...zero.on.rawField.depositedFluxRgb], [...zero.off.rawField.depositedFluxRgb]);
    assert.deepEqual([...zero.on.field.depositedFluxRgb], [...zero.off.field.depositedFluxRgb]);
  }
});

test("form reselection is deterministic, forms create distinct ON fields, and maximum-amplitude thickness stays positive", () => {
  const forms = LD1_FORM_PRESETS.map((preset) => preset.value);
  const initial = new Map(forms.map((form) => [form, runLd1Reference({ ...compact, form })]));
  for (const form of forms) {
    const replay = runLd1Reference({ ...compact, form });
    assert.deepEqual([...replay.on.field.depositedFluxRgb], [...initial.get(form)!.on.field.depositedFluxRgb]);
  }
  for (let i = 0; i < forms.length; i++) for (let j = i + 1; j < forms.length; j++) {
    assert.notDeepEqual([...initial.get(forms[i])!.on.field.depositedFluxRgb], [...initial.get(forms[j])!.on.field.depositedFluxRgb]);
  }
  for (const form of forms) for (let x = -1.08; x <= 1.08; x += .03) for (let z = -1.08; z <= 1.08; z += .03) {
    const thickness = LD1_GEOMETRY.baseTopY + reliefAndGradient(x, z, LD1_GEOMETRY.maxBulgeAmplitude, form).relief - LD1_GEOMETRY.lowerY;
    assert.ok(thickness > 0, `${form} thickness at ${x}, ${z}`);
  }
});

test("analytic height gradient produces the expected normalized entry normal", () => {
  const point = { x: .24, z: -.11 }; const g = reliefAndGradient(point.x, point.z, .18);
  const n = upperSurfaceNormal(point.x, point.z, .18);
  assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-12);
  assert.ok(Math.abs(n.x / n.y + g.gradientX) < 1e-12);
  assert.ok(Math.abs(n.z / n.y + g.gradientZ) < 1e-12);
});

test("fixed ray diagram maps every guide and representative segment in physical vertical order", () => {
  const source = mapLd1RayDiagramY(LD1_GEOMETRY.sourceY);
  const maximumUpper = mapLd1RayDiagramY(LD1_GEOMETRY.baseTopY + LD1_GEOMETRY.maxBulgeAmplitude);
  const baseUpper = mapLd1RayDiagramY(LD1_GEOMETRY.baseTopY);
  const lower = mapLd1RayDiagramY(LD1_GEOMETRY.lowerY);
  const receiver = mapLd1RayDiagramY(LD1_CONTRACT.receiverY);
  assert.ok(source < maximumUpper && maximumUpper < baseUpper && baseUpper < lower && lower < receiver);
  assert.deepEqual([mapLd1RayDiagramX(LD1_RAY_DIAGRAM_DOMAIN.minX), mapLd1RayDiagramX(LD1_RAY_DIAGRAM_DOMAIN.maxX)], [0, 1]);
  const result = runLd1Reference(compact);
  for (const segment of result.on.representative.flatMap((ray) => [ray.incident, ray.inside, ray.outgoing].filter(Boolean))) {
    for (const point of [segment.from, segment.to]) {
      assert.ok(mapLd1RayDiagramX(point.x) >= 0 && mapLd1RayDiagramX(point.x) <= 1);
      assert.ok(mapLd1RayDiagramY(point.y) >= 0 && mapLd1RayDiagramY(point.y) <= 1);
    }
  }
});

test("Snell refraction is normal-preserving at normal incidence and bends oblique rays", () => {
  const normal = { x: 0, y: 1, z: 0 };
  assert.deepEqual(refractSnell({ x: 0, y: -1, z: 0 }, normal, 1, 1.49), { x: 0, y: -1, z: 0 });
  const bent = refractSnell({ x: .4, y: -Math.sqrt(.84), z: 0 }, normal, 1, 1.49)!;
  assert.ok(Math.abs(bent.x) < .4 && bent.y < 0);
});

test("Snell identifies total internal reflection rather than fabricating an outgoing ray", () => {
  assert.equal(refractSnell({ x: .9, y: -Math.sqrt(.19), z: 0 }, { x: 0, y: 1, z: 0 }, 1.49, 1), null);
});

test("focused TIR exit accounting assigns surviving flux once, never also to reflection", () => {
  const inside = { x: .9, y: -Math.sqrt(.19), z: 0 };
  const outgoing = refractSnell(inside, { x: 0, y: 1, z: 0 }, 1.49, 1);
  const terminal = classifyExitTerminal({ r: .4, g: .3, b: .2 }, outgoing, 1);
  assert.equal(outgoing, null);
  assert.deepEqual(terminal.interfaceExit, { r: 0, g: 0, b: 0 });
  assert.deepEqual(terminal.reflected, { r: 0, g: 0, b: 0 });
  assert.deepEqual(terminal.tir, { r: .4, g: .3, b: .2 });
});

test("OFF and ON reuse one exact canonical finite-light buffer", () => {
  const result = runLd1Reference(compact);
  assert.equal(result.samples.length, compact.sampleCount * 4);
  const replay = runLd1Reference(compact);
  assert.deepEqual([...result.samples], [...replay.samples]);
  assert.equal(result.off.field.lightRevision, result.on.field.lightRevision);
});

test("OFF replay is deterministic and spatial ON response has a signed difference", () => {
  const first = runLd1Reference(compact); const second = runLd1Reference(compact);
  assert.deepEqual([...first.off.field.depositedFluxRgb], [...second.off.field.depositedFluxRgb]);
  assert.ok(first.signedDifference.some((value) => Math.abs(value) > 1e-9));
  assert.ok(first.absoluteDifference.some((value) => value > 1e-9));
  assert.ok(first.centroidDelta && Math.hypot(first.centroidDelta.u, first.centroidDelta.v) > 1e-4);
});

test("fixed common energy-normalized reconstruction conserves raw flux before containment", () => {
  const result = runLd1Reference(compact);
  for (const scenario of [result.off, result.on]) {
    const raw = integrateFluxRgb(scenario.rawField);
    const reconstructed = integrateFluxRgb(scenario.reconstructedField);
    const integrated = integrateFluxRgb(scenario.field);
    for (const channel of ["r", "g", "b"] as const) {
      assert.ok(Math.abs(raw[channel] - reconstructed[channel]) < 2e-6);
      assert.ok(Math.abs(integrated[channel] + scenario.ledger.rejected[channel] - scenario.ledger.deposited[channel]) < 2e-6);
      assert.ok(Math.abs(scenario.ledger.input[channel] - scenario.ledger.reflected[channel] - scenario.ledger.absorbed[channel] - scenario.ledger.deposited[channel] - scenario.ledger.escaped[channel] - scenario.ledger.tir[channel] - scenario.ledger.unresolved[channel]) < 2e-8);
    }
    assert.ok(scenario.ledger.interfaceExit.r <= scenario.ledger.input.r);
    assert.ok(scenario.ledger.deposited.r <= scenario.ledger.interfaceExit.r + 1e-9);
    assert.equal(scenario.supportLeakage, 0);
  }
});

test("containment metric compares reconstructed texels to contained texels, never ordinary redistribution", () => {
  const field = createReceiverTransportField({ receiverId: "ld1-clip", sceneRevision: "fixed", lightRevision: "fixed", width: 8, height: 8, minU: -1, minV: -1, sizeU: 2, sizeV: 2 });
  splatBilinearFluxRgb(field, 0, 0, { r: 1, g: 1, b: 1 });
  const reconstructed = blurFluxRgbEnergyNormalized(field, 2);
  const contained = applyShadowContainedSupport(reconstructed, new Uint8Array(64), 0).field;
  assert.equal(countSupportClippedTexels(reconstructed, reconstructed), 0);
  assert.ok(countSupportClippedTexels(reconstructed, contained) > 0);

  const result = runLd1Reference(compact);
  for (const scenario of [result.off, result.on]) {
    const ledger = scenario.ledger;
    assert.ok(Number.isInteger(ledger.supportRejectedTexelCount));
    assert.ok(ledger.supportRejectedTexelCount >= 0);
    assert.equal(
      ledger.deliveredCount + ledger.escapedCount + ledger.tirCount + ledger.missCount + ledger.invalidCount,
      ledger.inputCount,
    );
    assert.equal(ledger.deliveredCount, ledger.inputCount);
  }
});

test("small fixed receiver classifies receiver escapes once and terminal energy closes per channel", () => {
  const result = runLd1Reference({ sampleCount: 1024, fieldWidth: 32, fieldHeight: 32, receiverSize: .28 });
  for (const scenario of [result.off, result.on]) for (const channel of ["r", "g", "b"] as const) {
    const f = scenario.ledger;
    assert.ok(f.escaped[channel] > 0);
    assert.ok(Math.abs(f.input[channel] - f.reflected[channel] - f.absorbed[channel] - f.deposited[channel] - f.escaped[channel] - f.tir[channel] - f.unresolved[channel]) < 2e-8);
  }
});

test("common causal straight support is non-invented and shared between OFF and ON", () => {
  const result = runLd1Reference(compact);
  assert.ok(result.support.some(Boolean));
  assert.ok(result.straightField.geometricCoverage.some((value) => value > 0));
  assert.equal(result.off.field.width, result.on.field.width);
  assert.equal(result.off.field.minU, result.on.field.minU);
});

test("OFF and ON use the same absolute display scale with no peak normalization", () => {
  const result = runLd1Reference(compact);
  const off = physicalDisplayRgb(result.off.field, result.config);
  const on = physicalDisplayRgb(result.on.field, result.config);
  assert.equal(result.config.displayScale, LD1_CONTRACT.displayScale);
  assert.equal(result.config.exposure, 1);
  assert.notDeepEqual([...off], [...on]);
});

test("invalid configurations fail before tracing", () => {
  assert.throws(() => makeLd1Config({ sampleCount: 0 }), RangeError);
  assert.throws(() => makeLd1Config({ bulgeAmplitude: .33 }), RangeError);
  assert.throws(() => makeLd1Config({ ior: 1 }), RangeError);
  assert.throws(() => makeLd1Config({ receiverY: 0 }), RangeError);
});
