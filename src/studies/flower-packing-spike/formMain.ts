import "./style.css";
import "./formStyle.css";
import manifest from "./manifest.json";
import {
  FLOWER_FORM_VARIANTS,
  paramsForFlowerVariant,
} from "./flowerForm.ts";
import { FlowerFormRenderer } from "./formRenderer.ts";
import { buildFlowerFormUi, type FlowerFormUiState } from "./formUi.ts";

const app = document.getElementById("app");
if (!app) throw new Error("#app was not found");

let currentState: FlowerFormUiState;
const viewRenderers: FlowerFormRenderer[] = [];
const atlasRenderers = new Map<string, FlowerFormRenderer>();

function updateAll(next: FlowerFormUiState): void {
  currentState = next;
  for (const renderer of viewRenderers) {
    renderer.update(next.petalCount, next.params, next.showSources);
  }
  for (const variant of FLOWER_FORM_VARIANTS) {
    const renderer = atlasRenderers.get(variant.id);
    const params = variant.id === next.selectedVariant
      ? next.params
      : paramsForFlowerVariant(variant.id, next.params);
    renderer?.update(next.petalCount, params, false);
  }
}

currentState = buildFlowerFormUi(app, manifest.version, manifest.updatedAt, {
  onStateChange: updateAll,
});

for (const [id, view] of [
  ["flower-view-front", "front"],
  ["flower-view-side", "side"],
  ["flower-view-oblique", "oblique"],
] as const) {
  const host = document.getElementById(id);
  if (!host) throw new Error(`#${id} was not found`);
  viewRenderers.push(new FlowerFormRenderer(host, { view }));
}

for (const variant of FLOWER_FORM_VARIANTS) {
  const host = document.getElementById(`flower-atlas-${variant.id}`);
  if (!host) throw new Error(`#flower-atlas-${variant.id} was not found`);
  atlasRenderers.set(
    variant.id,
    new FlowerFormRenderer(host, {
      view: "thumbnail",
      resolution: 28,
      background: 0x17191d,
      showGuide: false,
    }),
  );
}

updateAll(currentState);

function animate(): void {
  for (const renderer of viewRenderers) renderer.render();
  for (const renderer of atlasRenderers.values()) renderer.render();
  window.requestAnimationFrame(animate);
}
animate();
