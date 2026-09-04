import type { HanaAuthoringDocument } from "./authoringDocument.ts";
import { validateHanaFlower, type HanaFlower } from "./flowerAuthoring.ts";

export interface HanaFlowerUiState {
  document: HanaAuthoringDocument;
  flowers: readonly HanaFlower[];
  activeFlowerId: string | null;
  coreStrokeId: string | null;
  multiSelect: boolean;
  materializedFlowerId: string | null;
  materializedSampleCount: number;
}

export interface HanaFlowerUiActions {
  getState: () => HanaFlowerUiState;
  setMultiSelect: (enabled: boolean) => void;
  selectStroke: (strokeId: string, additive: boolean) => void;
  setCoreStroke: (strokeId: string | null) => void;
  createFlower: () => void;
  selectFlower: (flowerId: string | null) => void;
  deleteSelectedStrokes: () => void;
}

export interface HanaFlowerUiHandle {
  refresh: () => void;
  isMultiSelect: () => boolean;
}

function button(label: string, id: string, className = ""): string {
  return `<button id="${id}" type="button" class="${className}">${label}</button>`;
}

export function initializeHanaFlowerAuthoringUi(
  actions: HanaFlowerUiActions,
): HanaFlowerUiHandle {
  const pane = document.querySelector<HTMLElement>(".hana-left-lower");
  if (!pane) throw new Error("HANA lower authoring pane is required for Flower Authoring UI");
  const existing = document.getElementById("hana-flower-section");
  if (existing) existing.remove();

  const panel = document.createElement("aside");
  panel.id = "hana-flower-section";
  panel.className = "hana-flower-section";
  panel.setAttribute("aria-label", "Flower authoring");
  panel.innerHTML = `
    <div class="hana-flower-heading">
      <strong>FLOWER</strong>
      <span id="hana-flower-selection-count">Selected Strokes: 0</span>
    </div>
    <div class="hana-flower-actions">
      ${button("Multi Select OFF", "hana-flower-multi-select")}
    </div>
    <div class="hana-flower-subsection">
      <span class="hana-flower-label">Strokes</span>
      <div id="hana-flower-stroke-list" class="hana-flower-list"></div>
    </div>
    <div class="hana-flower-core-row">
      <span id="hana-flower-core-status">Core: None</span>
      ${button("Clear Core", "hana-flower-clear-core", "hana-flower-small-action")}
    </div>
    <div id="hana-flower-core-list" class="hana-flower-core-list"></div>
    <button id="hana-flower-create" type="button" class="hana-flower-create">Create Flower</button>
    <div class="hana-flower-subsection">
      <span class="hana-flower-label">Flowers</span>
      <div id="hana-flower-list" class="hana-flower-list"></div>
    </div>
    <div id="hana-flower-active" class="hana-flower-active">Active Flower: None</div>
    <div id="hana-flower-status" class="hana-flower-status" role="status">Select Strokes to author a Flower</div>
  `;
  pane.appendChild(panel);

  const multiSelectButton = panel.querySelector<HTMLButtonElement>("#hana-flower-multi-select")!;
  multiSelectButton.title = "Touch fallback for keyboard-less multi-select. With a hardware keyboard, Shift+tap adds or removes Strokes instead.";
  const clearCoreButton = panel.querySelector<HTMLButtonElement>("#hana-flower-clear-core")!;
  const createButton = panel.querySelector<HTMLButtonElement>("#hana-flower-create")!;
  const deleteSelectedButton = document.createElement("button");
  deleteSelectedButton.id = "hana-flower-delete-selected";
  deleteSelectedButton.type = "button";
  deleteSelectedButton.className = "hana-flower-delete-action";
  deleteSelectedButton.textContent = "Delete Selected";
  panel.querySelector(".hana-flower-core-row")?.insertAdjacentElement("afterend", deleteSelectedButton);
  const strokeList = panel.querySelector<HTMLElement>("#hana-flower-stroke-list")!;
  const coreList = panel.querySelector<HTMLElement>("#hana-flower-core-list")!;
  const flowerList = panel.querySelector<HTMLElement>("#hana-flower-list")!;
  const activeFlower = panel.querySelector<HTMLElement>("#hana-flower-active")!;
  const selectionCount = panel.querySelector<HTMLElement>("#hana-flower-selection-count")!;
  const coreStatus = panel.querySelector<HTMLElement>("#hana-flower-core-status")!;
  const status = panel.querySelector<HTMLElement>("#hana-flower-status")!;

  const stopPanelPointer = (event: Event) => event.stopPropagation();
  panel.addEventListener("pointerdown", stopPanelPointer);
  panel.addEventListener("touchstart", stopPanelPointer, { passive: true });

  const handle: HanaFlowerUiHandle = {
    refresh: () => {
      const state = actions.getState();
      const selected = new Set(state.document.selectedStrokeIds);
      selectionCount.textContent = `Selected Strokes: ${state.document.selectedStrokeIds.length}`;
      multiSelectButton.textContent = `Multi Select ${state.multiSelect ? "ON" : "OFF"}`;
      multiSelectButton.setAttribute("aria-pressed", String(state.multiSelect));
      clearCoreButton.disabled = state.coreStrokeId === null;
      coreStatus.textContent = `Core: ${state.coreStrokeId ?? "None"}`;
      createButton.disabled = state.document.selectedStrokeIds.length === 0;
      deleteSelectedButton.textContent = `Delete Selected${state.document.selectedStrokeIds.length > 0 ? ` (${state.document.selectedStrokeIds.length})` : ""}`;
      deleteSelectedButton.disabled = state.document.selectedStrokeIds.length === 0;

      strokeList.replaceChildren(...state.document.strokes.map((stroke) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `hana-flower-stroke${selected.has(stroke.id) ? " is-selected" : ""}`;
        item.textContent = `${stroke.id}${stroke.role !== "free" ? ` · ${stroke.role}` : ""}`;
        item.setAttribute("aria-pressed", String(selected.has(stroke.id)));
        item.addEventListener("click", (event) => actions.selectStroke(
          stroke.id,
          actions.getState().multiSelect || event.shiftKey,
        ));
        return item;
      }));

      coreList.replaceChildren(...state.document.selectedStrokeIds.map((strokeId) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `hana-flower-core-choice${state.coreStrokeId === strokeId ? " is-core" : ""}`;
        item.textContent = state.coreStrokeId === strokeId ? `Core · ${strokeId}` : `Set Core · ${strokeId}`;
        item.setAttribute("aria-pressed", String(state.coreStrokeId === strokeId));
        item.addEventListener("click", () => actions.setCoreStroke(strokeId));
        return item;
      }));

      flowerList.replaceChildren(...state.flowers.map((flower) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `hana-flower-item${state.activeFlowerId === flower.id ? " is-active" : ""}`;
        item.textContent = `${flower.id} · ${flower.petalStrokeIds.length} petals · ${flower.coreStrokeIds.length} core`;
        item.setAttribute("aria-pressed", String(state.activeFlowerId === flower.id));
        item.addEventListener("click", () => actions.selectFlower(flower.id));
        return item;
      }));

      const active = state.flowers.find((flower) => flower.id === state.activeFlowerId) ?? null;
      if (!active) {
        activeFlower.textContent = "Active Flower: None";
      } else {
        const validation = validateHanaFlower(active, state.document.strokes);
        const material = state.materializedFlowerId === active.id
          ? ` · material ${state.materializedSampleCount}`
          : "";
        activeFlower.textContent = `Active Flower: ${active.id} · petals ${active.petalStrokeIds.length} · core ${active.coreStrokeIds.length}${material}${validation.valid ? "" : " · INVALID"}`;
      }
      status.textContent = state.document.strokes.length === 0
        ? "Draw Strokes with Apple Pencil · select with Mouse / Touch"
        : state.flowers.length === 0
          ? "Select Strokes, set an optional Core, then Create Flower"
          : `${state.flowers.length} Flower${state.flowers.length === 1 ? "" : "s"} · source Strokes remain editable`;
    },
    isMultiSelect: () => actions.getState().multiSelect,
  };

  multiSelectButton.addEventListener("click", () => {
    actions.setMultiSelect(!actions.getState().multiSelect);
    handle.refresh();
  });
  clearCoreButton.addEventListener("click", () => {
    actions.setCoreStroke(null);
    handle.refresh();
  });
  createButton.addEventListener("click", () => {
    actions.createFlower();
    handle.refresh();
  });
  deleteSelectedButton.addEventListener("click", () => {
    actions.deleteSelectedStrokes();
    handle.refresh();
  });
  handle.refresh();
  return handle;
}
