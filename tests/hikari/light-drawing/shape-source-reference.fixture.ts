import { DEFAULT_HIKARI_SETTINGS } from "../../../src/studies/cloud-sculpt/hikari.ts";
import type { OpticalSettings } from "../../../src/studies/cloud-sculpt/optics.ts";
import type { ShapeSource } from "../../../src/studies/cloud-sculpt/opticalScene.ts";

/**
 * Literal capture of docs/hikari/cases/hikari-blender-backlight-study.hkr.
 * The source document is v0.29.2 / b8f7b50 and has one grow recipe:
 * k=.6, count=12, radiusBase=.7, radiusSpread=.5, seed="yohaku".
 */
export const BACKLIGHT_STUDY_PROVENANCE = Object.freeze({
  documentId: "hikari-blender-backlight-study",
  documentVersion: "0.29.2",
  commit: "b8f7b50",
  recipe: Object.freeze({ k: 0.6, count: 12, radiusBase: 0.7, radiusSpread: 0.5, seed: "yohaku" }),
});

export const BACKLIGHT_STUDY_SHAPE_SOURCE = Object.freeze({
  kind: "balls-smooth-union" as const,
  smoothness: 0.6,
  balls: Object.freeze([
    Object.freeze({ center: Object.freeze({ x: -0.269878791018432, y: 0.05433873209373625, z: -0.19221987064867435 }), radius: 0.5315774349030107 }),
    Object.freeze({ center: Object.freeze({ x: -0.5902613234327978, y: 0.25409363158028014, z: 0.11735392924641289 }), radius: 0.8532935356139205 }),
    Object.freeze({ center: Object.freeze({ x: -1.0755470476953504, y: 0.5192206250147399, z: 0.28313097446312147 }), radius: 0.7401694570085965 }),
    Object.freeze({ center: Object.freeze({ x: 0.09954366110054551, y: 0.0611239406014979, z: 0.34691631123396466 }), radius: 0.8154171256697736 }),
    Object.freeze({ center: Object.freeze({ x: 0.2662731924662021, y: 0.7989480555028109, z: -0.4271062443287324 }), radius: 0.8441750376834534 }),
    Object.freeze({ center: Object.freeze({ x: -1.1837542709546183, y: -0.4845048566377284, z: 0.23337716090673571 }), radius: 0.8701753827626817 }),
    Object.freeze({ center: Object.freeze({ x: 0.18177369671589264, y: 0.20095047370326094, z: -0.08859160411550757 }), radius: 0.8155643804697319 }),
    Object.freeze({ center: Object.freeze({ x: -0.6788088220474818, y: 0.546986597348986, z: -0.5151529404813813 }), radius: 0.539589778217487 }),
    Object.freeze({ center: Object.freeze({ x: -1.1934036738257954, y: 0.2990764682432214, z: -0.8771273996649163 }), radius: 0.7304373154998757 }),
    Object.freeze({ center: Object.freeze({ x: -0.9701075381508073, y: -0.0015734673434252703, z: 1.0197345843491605 }), radius: 0.7574073235271498 }),
    Object.freeze({ center: Object.freeze({ x: -0.35084508669996245, y: 0.6870610865012092, z: 0.12955976201731975 }), radius: 0.7863509186776354 }),
    Object.freeze({ center: Object.freeze({ x: -1.0823261636451325, y: -0.40803320669190674, z: -0.859932383836846 }), radius: 0.6483369641355239 }),
  ]),
}) satisfies ShapeSource;

/** Frozen diagnostic settings; each comparison panel changes only sunSize. */
export const SHAPE_SOURCE_REFERENCE_SETTINGS = Object.freeze({
  ...DEFAULT_HIKARI_SETTINGS,
  phenomenon: "optics" as const,
  daylightMode: "manual" as const,
  lightAngle: -24,
  lightWidth: 1,
  inclusionEnabled: false,
  opticalSeed: "shape-source-reference-2026-08-09",
  opticalSampleCount: 16384,
});

export const SHAPE_SOURCE_REFERENCE_PANELS = Object.freeze([
  Object.freeze({ sunSize: 0.53, sampleCount: 16384 }),
  Object.freeze({ sunSize: 5, sampleCount: 16384 }),
  Object.freeze({ sunSize: 20, sampleCount: 16384 }),
]);

export function settingsForShapeSourceReferencePanel(
  panel: typeof SHAPE_SOURCE_REFERENCE_PANELS[number],
): OpticalSettings {
  return { ...SHAPE_SOURCE_REFERENCE_SETTINGS, sunSize: panel.sunSize };
}
