import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import {
  VIEW_OBSERVATION_MAX_PIXELS,
  ViewObservationPass,
  detectViewObservationCapability,
  fitViewObservationSize,
} from "../../src/studies/cloud-sculpt/viewObservationPass.ts";
import { VIEW_PATH_CODE } from "../../src/studies/cloud-sculpt/opticalObservation.ts";
import { viewObservationFragmentShader } from "../../src/studies/cloud-sculpt/shaders.ts";

const rendererSource = readFileSync(
  new URL("../../src/studies/cloud-sculpt/renderer.ts", import.meta.url),
  "utf8",
);

function capabilityProbe(overrides: Record<string, unknown> = {}) {
  return {
    isWebGL2: true,
    hasColorBufferFloat: true,
    maxDrawBuffers: 4,
    maxColorAttachments: 4,
    framebufferComplete: true,
    ...overrides,
  };
}

function fakeRenderer(throwOnRender = false): any {
  const gl = {
    MAX_DRAW_BUFFERS: 0x8824,
    MAX_COLOR_ATTACHMENTS: 0x8cdf,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    getParameter(parameter: number) {
      return parameter === 0x8824 || parameter === 0x8cdf ? 4 : 0;
    },
    checkFramebufferStatus() {
      return 0x8cd5;
    },
  };
  const color = new THREE.Color(0x101114);
  let target: unknown = null;
  const calls: string[] = [];
  return {
    calls,
    capabilities: { isWebGL2: true },
    extensions: { has: () => true },
    xr: { enabled: true },
    autoClear: false,
    getContext: () => gl,
    getRenderTarget: () => target,
    setRenderTarget(next: unknown) { target = next; calls.push("target"); },
    getViewport(value: THREE.Vector4) { return value.set(4, 5, 320, 180); },
    setViewport() { calls.push("viewport"); },
    getScissor(value: THREE.Vector4) { return value.set(8, 9, 20, 30); },
    setScissor() { calls.push("scissor"); },
    getScissorTest: () => true,
    setScissorTest() { calls.push("scissorTest"); },
    getClearColor(value: THREE.Color) { return value.copy(color); },
    getClearAlpha: () => 0.37,
    setClearColor() { calls.push("clearColor"); },
    clear() { calls.push("clear"); },
    render() {
      calls.push("render");
      if (throwOnRender) throw new Error("render seam");
    },
  };
}

test("fitViewObservationSize applies half scale, aspect, zero safety, and 720p cap", () => {
  assert.deepEqual(fitViewObservationSize(800, 600), { width: 400, height: 300 });
  assert.deepEqual(fitViewObservationSize(0, 0), { width: 1, height: 1 });
  const ultrawide = fitViewObservationSize(5120, 720);
  assert.ok(ultrawide.width / ultrawide.height > 6.5);
  assert.ok(ultrawide.width * ultrawide.height <= VIEW_OBSERVATION_MAX_PIXELS);
  const highDpi = fitViewObservationSize(2880, 1800);
  assert.ok(highDpi.width * highDpi.height <= VIEW_OBSERVATION_MAX_PIXELS);
});

test("capability gate reports each hard failure without a fallback", () => {
  for (const [field, expected] of [
    ["isWebGL2", "WebGL2"],
    ["hasColorBufferFloat", "EXT_color_buffer_float"],
    ["maxDrawBuffers", "MAX_DRAW_BUFFERS"],
    ["maxColorAttachments", "MAX_COLOR_ATTACHMENTS"],
    ["framebufferComplete", "framebuffer"],
  ] as const) {
    const probe = capabilityProbe({ [field]: field === "maxDrawBuffers" || field === "maxColorAttachments" ? 1 : field === "framebufferComplete" ? false : false });
    const result = detectViewObservationCapability(probe);
    assert.equal(result.supported, false, field);
    assert.match(result.reason ?? "", new RegExp(expected, "i"));
  }
  assert.equal(detectViewObservationCapability(capabilityProbe()).supported, true);
});

test("disabled pass allocates no target/material and exposes an explicit disabled state", () => {
  const renderer = fakeRenderer();
  const pass = new ViewObservationPass(renderer, {}, { enabled: false });
  assert.equal(pass.material, null);
  assert.equal(pass.quad, null);
  assert.equal(pass.getTarget(), null);
  assert.equal(pass.getTextures().length, 0);
  assert.equal(pass.getStatus().availability, "disabled");
  pass.dispose();
});

test("supported pass owns two nearest linear-HDR attachments with no depth/MSAA", () => {
  const renderer = fakeRenderer();
  const uniforms = { uRenderMode: { value: 1 } } as any;
  const pass = new ViewObservationPass(renderer, uniforms, {
    enabled: true,
    initialWidth: 800,
    initialHeight: 600,
  });
  const target = pass.getTarget();
  assert.ok(target);
  assert.equal(target!.textures.length, 2);
  assert.equal(target!.depthBuffer, false);
  assert.equal(target!.stencilBuffer, false);
  assert.equal(target!.samples, 0);
  for (const texture of pass.getTextures()) {
    assert.equal(texture.type, THREE.HalfFloatType);
    assert.equal(texture.format, THREE.RGBAFormat);
    assert.equal(texture.minFilter, THREE.NearestFilter);
    assert.equal(texture.magFilter, THREE.NearestFilter);
    assert.equal(texture.generateMipmaps, false);
  }
  assert.equal(pass.getStatus().vramBytes, 400 * 300 * 16);
  pass.dispose();
});

test("render restores target, viewport, scissor, clear state, autoClear, and XR on throw", () => {
  const renderer = fakeRenderer(true);
  const uniforms = {
    uRenderMode: { value: 1 },
    uResolution: { value: new THREE.Vector2(12, 13) },
    uPixelJitter: { value: new THREE.Vector2(0.1, 0.2) },
    uProgressiveLinearOutput: { value: 1 },
    uProgressiveSampleIndex: { value: 7 },
  } as any;
  const pass = new ViewObservationPass(renderer, uniforms, { enabled: true });
  assert.throws(() => pass.render(new THREE.PerspectiveCamera(), 0), /render seam/);
  assert.equal(renderer.autoClear, false);
  assert.equal(renderer.xr.enabled, true);
  assert.deepEqual(uniforms.uResolution.value.toArray(), [12, 13]);
  assert.deepEqual(uniforms.uPixelJitter.value.toArray(), [0.1, 0.2]);
  assert.equal(uniforms.uProgressiveLinearOutput.value, 1);
  assert.equal(uniforms.uProgressiveSampleIndex.value, 7);
  assert.deepEqual(renderer.calls.slice(-7), ["clear", "render", "target", "viewport", "scissor", "scissorTest", "clearColor"]);
  pass.dispose();
});

test("dynamic diagnostics are dirty-driven and capped at 10 Hz", () => {
  const renderer = fakeRenderer();
  const pass = new ViewObservationPass(renderer, { uRenderMode: { value: 1 } } as any, { enabled: true });
  pass.setDynamic(true);
  assert.equal(pass.render(new THREE.PerspectiveCamera(), 0), true);
  pass.markDirty();
  assert.equal(pass.render(new THREE.PerspectiveCamera(), 50), false);
  assert.equal(pass.render(new THREE.PerspectiveCamera(), 100), true);
  assert.equal(pass.getStatus().renderCount, 2);
  pass.dispose();
});

test("resize disposes the prior target and does not grow attachment count", () => {
  const renderer = fakeRenderer();
  const pass = new ViewObservationPass(renderer, {}, { enabled: true, initialWidth: 640, initialHeight: 480 });
  const first = pass.getTarget();
  let disposed = 0;
  first?.addEventListener("dispose", () => { disposed++; });
  pass.resize(1920, 1080);
  const second = pass.getTarget();
  assert.notEqual(second, first);
  assert.equal(disposed, 1);
  assert.equal(pass.getTextures().length, 2);
  assert.ok(pass.getSize().width * pass.getSize().height <= VIEW_OBSERVATION_MAX_PIXELS);
  pass.dispose();
  assert.equal(pass.getTextures().length, 0);
});

test("context loss/restoration publishes capability truth and keeps two attachments", () => {
  const renderer = fakeRenderer();
  const pass = new ViewObservationPass(renderer, {}, { enabled: true, initialWidth: 640, initialHeight: 480 });
  pass.handleContextLost();
  assert.equal(pass.getStatus().availability, "unsupported");
  assert.equal(pass.getStatus().capability.supported, false);
  assert.equal(pass.getTextures().length, 0);
  pass.handleContextRestored();
  assert.equal(pass.getStatus().availability, "available");
  assert.equal(pass.getStatus().capability.supported, true);
  assert.equal(pass.getTextures().length, 2);
  pass.dispose();
});

test("path-code alpha contract is explicit and observation shader writes both MRT outputs", () => {
  assert.deepEqual(VIEW_PATH_CODE, {
    noEvent: 0,
    transmittedWithoutInternalReflection: 1,
    transmittedAfterOneInternalReflection: 2,
    unresolvedOuterPath: 3,
    ambiguousNestedFallback: 4,
  });
  assert.match(viewObservationFragmentShader, /layout\(location = 0\) out vec4 outViewReflection/);
  assert.match(viewObservationFragmentShader, /layout\(location = 1\) out vec4 outViewTransmission/);
  assert.match(viewObservationFragmentShader, /max\(\s*reflectedColor \* fresnel \+ directSpecular/);
  assert.match(viewObservationFragmentShader, /baseTransmission \* \(1\.0 - fresnel\)/);
  assert.match(viewObservationFragmentShader, /float\(viewPathCode\)/);
});

test("CloudRenderer keeps observation as an internal opt-in before every Beauty branch", () => {
  assert.match(rendererSource, /const viewObservationEnabled = options\.viewObservation === true/);
  assert.match(rendererSource, /this\.viewObservationPass = viewObservationEnabled\s*\? new ViewObservationPass/);
  assert.doesNotMatch(rendererSource, /enableViewObservation/);
  const observationCall = rendererSource.indexOf("this.renderViewObservation(now);");
  const naturalCall = rendererSource.indexOf("this.renderer.render(this.scene, this.camera);");
  assert.ok(observationCall >= 0 && naturalCall > observationCall);
});

test("CloudRenderer promotes ordinary camera signature changes to dynamic 10 Hz mode, then settles", () => {
  assert.match(rendererSource, /const cameraChanged = signature !== this\.viewCameraSignature/);
  assert.match(
    rendererSource,
    /pass\.setDynamic\(\s*cameraChanged\s*\|\| this\.realtimeMotionMode\s*\|\| this\.backgroundMediaVideo !== null/,
  );
  assert.match(rendererSource, /On the first unchanged frame we return to static mode/);
});

test("shader source ViewPathCode branches keep miss/front/TIR/nested meanings explicit", () => {
  assert.match(viewObservationFragmentShader, /outViewReflection = vec4\(0\.0\)/);
  assert.match(viewObservationFragmentShader, /outViewTransmission = vec4\(0\.0\)/);
  assert.match(viewObservationFragmentShader, /if \(nestedPathAmbiguous\) \{\s*viewPathCode = 4/);
  assert.match(viewObservationFragmentShader, /hadInternalReflection && hasTransmittedExit\) \{\s*viewPathCode = 2/);
  assert.match(viewObservationFragmentShader, /hadInternalReflection && !hasTransmittedExit\) \{\s*viewPathCode = 3/);
  assert.match(viewObservationFragmentShader, /else if \(hasTransmittedExit\) \{\s*viewPathCode = 1/);
});
