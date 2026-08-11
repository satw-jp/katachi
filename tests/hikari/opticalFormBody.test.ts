import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string): string => readFileSync(
  new URL(`../../src/studies/cloud-sculpt/${relative}`, import.meta.url),
  "utf8",
);

test("Optical FORM body is a query-local Worker bridge over the existing FORM sampler", () => {
  const bridge = read("formObservation/opticalBodyController.ts");
  const main = read("main.ts");
  assert.match(bridge, /new URL\("\.\/sampling\.worker\.ts", import\.meta\.url\)/);
  assert.match(bridge, /samplingIdentity\(/);
  assert.match(bridge, /setOpticalFormBodyData\(message\.pointSet\.positions\)/);
  assert.match(bridge, /worker\.terminate\(\)/);
  assert.doesNotMatch(bridge, /OpticsLayer|traceStraightRay|rebuildCpu|CausticField/);
  const queryBlock = main.slice(
    main.indexOf("if (opticalImprintEnabled)"),
    main.indexOf("if (formObservationEnabled)"),
  );
  assert.match(queryBlock, /new OpticalFormBodyController/);
  assert.match(queryBlock, /windowsCompatibilityMode \? 40_000 : 80_000/);
  assert.match(main, /opticalFormBody\?\.setGeometry\(currentFormGeometry\(\)\)/);
  assert.match(main, /opticalFormBody\?\.dispose\(\)/);
});

test("FORM points and grounded trails replace only the optical BODY and share its orbit camera", () => {
  const renderer = read("renderer.ts");
  const shader = read("shaders.ts");
  assert.match(renderer, /setOpticalFormBodyEnabled\(enabled: boolean\)/);
  assert.match(renderer, /this\.opticalFormBodyScene = new THREE\.Scene\(\)/);
  assert.match(renderer, /new THREE\.ShaderMaterial\([\s\S]*opticalFormPointVertexShader/);
  assert.match(renderer, /this\.opticalFormBodyTrails = new THREE\.Points\([\s\S]*this\.opticalFormBodyTrailMaterial/);
  assert.match(renderer, /this\.opticalFormOrbitTrails = new THREE\.Mesh\([\s\S]*this\.opticalFormOrbitTrailMaterial/);
  assert.match(renderer, /aTrailStart/);
  assert.match(renderer, /aTrailEnd/);
  assert.match(renderer, /aRibbonSide/);
  assert.match(renderer, /cameraDisplayScale = clamp\(5\.0 \/ max\(0\.001, abs\(clip\.w\)\), 0\.65, 4\.0\)/);
  assert.match(renderer, /halfWidthPixels = 0\.5 \* uLineWidth \* cameraDisplayScale\(clip\.w\)/);
  assert.match(renderer, /texture2D\(uStructure/);
  assert.match(renderer, /texture2D\(uLight/);
  assert.match(renderer, /OPTICAL_FORM_BASE_TRAIL_COUNT = 420/);
  assert.match(renderer, /OPTICAL_FORM_MAX_TRAIL_DENSITY = 4/);
  assert.match(renderer, /OPTICAL_FORM_TRAIL_STEPS = 48/);
  assert.match(renderer, /OPTICAL_FORM_GOLDEN_RATIO_CONJUGATE/);
  assert.match(renderer, /visibleTrails \* \(OPTICAL_FORM_TRAIL_STEPS - 1\) \* 6/);
  assert.match(renderer, /enabled \? THREE\.AdditiveBlending : THREE\.NormalBlending/);
  assert.match(renderer, /this\.renderer\.render\(this\.opticalFormBodyScene, this\.camera\)/);
  assert.match(renderer, /this\.opticalFormBodyGeometry\?\.dispose\(\)/);
  assert.match(renderer, /this\.opticalFormBodyTrailGeometry\?\.dispose\(\)/);
  assert.match(renderer, /this\.opticalFormOrbitTrailGeometry\?\.dispose\(\)/);
  assert.match(renderer, /this\.opticalFormOrbitTrailMaterial\?\.dispose\(\)/);
  assert.match(renderer, /this\.opticalFormBodyMaterial\?\.dispose\(\)/);
  assert.match(shader, /uniform int uOpticalFormBodyEnabled/);
  assert.match(shader, /uRenderMode == 1 && uOpticalFormBodyEnabled == 1/);
  assert.doesNotMatch(shader, /uOpticalFormBodyEnabled[\s\S]{0,300}marchInside/);
});

test("Optical Imprint exposes FORM as the default body with OPTICS comparison retained", () => {
  const controller = read("opticalImprintController.ts");
  const shader = read("shaders.ts");
  assert.match(controller, /bodySourceText\.textContent = "本体の描画"/);
  assert.match(controller, /\["form", "FORM 点描（回転可能）"\]/);
  assert.match(controller, /\["optics", "OPTICS 透明体"\]/);
  assert.match(controller, /bodySource\.value = "form"/);
  assert.match(controller, /renderer\.setOpticalFormBodyEnabled\(usesForm\)/);
  assert.match(controller, /dissolveBlock\.hidden = usesForm/);
  assert.match(controller, /OPTICS BODY dissolve drawing/);
  assert.match(controller, /背景を黒にする/);
  assert.match(controller, /renderer\.setOpticalFormBlackBackground/);
  assert.match(shader, /uOpticalFormBlackBackground == 1/);
});
