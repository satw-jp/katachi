import {
  createAuthoringGraph,
  type HanaAuthoringGraph,
} from "./authoringGraph.ts";
import {
  migrateHanaDocument,
  type HanaAuthoringDocument,
} from "./authoringDocument.ts";
import { createHanaAuthoringStudy } from "./authoringStudy.ts";
import type { HanaFlower } from "./flowerAuthoring.ts";
import {
  exportHanaSkinBridge,
  serializeHanaSkinBridge,
  validateHanaSkinBridge,
  type HanaSkinBridgeDocument,
} from "./skinBridge.ts";
import { HanaUndoRedo } from "./undoRedo.ts";

const HANA_AUTHORING_STUDY_FORMAT = "katachi.hana-authoring-study.v0" as const;

interface HanaAuthoringStudyPayload {
  format: typeof HANA_AUTHORING_STUDY_FORMAT;
  document: HanaAuthoringDocument;
  flowers: HanaFlower[];
  graph: HanaAuthoringGraph;
}

interface HanaAuthoringUiState {
  document: HanaAuthoringDocument;
  flowers: HanaFlower[];
  graph: HanaAuthoringGraph;
  bridge: HanaSkinBridgeDocument;
}

type HanaAuthoringWindow = Window & {
  __HANA_AUTHORING__?: {
    loadStudy: () => HanaAuthoringUiState;
    exportBridge: () => HanaSkinBridgeDocument | null;
    snapshot: () => HanaAuthoringUiState | null;
  };
};

function downloadJson(filename: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function studyPayload(state: HanaAuthoringUiState): HanaAuthoringStudyPayload {
  return {
    format: HANA_AUTHORING_STUDY_FORMAT,
    document: state.document,
    flowers: state.flowers,
    graph: state.graph,
  };
}

function readStudyPayload(value: unknown): HanaAuthoringUiState {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const document = migrateHanaDocument(source.document ?? value);
  const flowers = Array.isArray(source.flowers) ? source.flowers as HanaFlower[] : [];
  const graph = source.graph && typeof source.graph === "object"
    ? source.graph as HanaAuthoringGraph
    : createAuthoringGraph();
  const bridge = exportHanaSkinBridge({ document, flowers, graph });
  const validation = validateHanaSkinBridge(bridge);
  if (!validation.valid) throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  return { document, flowers, graph, bridge };
}

export function initializeHanaAuthoringStackUi(): void {
  const toolbar = document.querySelector<HTMLElement>(".hana-toolbar");
  if (!toolbar || document.getElementById("hana-authoring-stack")) return;
  const panel = document.createElement("div");
  panel.id = "hana-authoring-stack";
  panel.className = "hana-authoring-stack";
  panel.setAttribute("aria-label", "HANA Authoring Study");
  panel.innerHTML = `
    <span class="hana-authoring-title">Authoring Study</span>
    <button id="hana-authoring-load-study" type="button">Load Study</button>
    <button id="hana-authoring-save-study" type="button" class="hana-secondary">Save Study</button>
    <button id="hana-authoring-load-json" type="button" class="hana-secondary">Load JSON</button>
    <button id="hana-authoring-export-bridge" type="button" class="hana-secondary">Export Bridge</button>
    <button id="hana-authoring-undo" type="button" class="hana-secondary" disabled>Undo</button>
    <button id="hana-authoring-redo" type="button" class="hana-secondary" disabled>Redo</button>
    <input id="hana-authoring-file" type="file" accept="application/json" hidden />
    <span id="hana-authoring-status" class="hana-authoring-status" role="status">No Study loaded</span>
  `;
  toolbar.appendChild(panel);

  const loadButton = panel.querySelector<HTMLButtonElement>("#hana-authoring-load-study")!;
  const saveButton = panel.querySelector<HTMLButtonElement>("#hana-authoring-save-study")!;
  const loadJsonButton = panel.querySelector<HTMLButtonElement>("#hana-authoring-load-json")!;
  const exportBridgeButton = panel.querySelector<HTMLButtonElement>("#hana-authoring-export-bridge")!;
  const undoButton = panel.querySelector<HTMLButtonElement>("#hana-authoring-undo")!;
  const redoButton = panel.querySelector<HTMLButtonElement>("#hana-authoring-redo")!;
  const fileInput = panel.querySelector<HTMLInputElement>("#hana-authoring-file")!;
  const status = panel.querySelector<HTMLElement>("#hana-authoring-status")!;
  let state: HanaAuthoringUiState | null = null;
  let history: HanaUndoRedo<HanaAuthoringDocument> | null = null;

  const render = (message?: string) => {
    if (!state || !history) {
      status.textContent = message ?? "No Study loaded";
      undoButton.disabled = true;
      redoButton.disabled = true;
      return;
    }
    const flowerCount = state.flowers.length;
    const petalCount = state.flowers.reduce((total, flower) => total + flower.petalStrokeIds.length, 0);
    status.textContent = message ?? `${state.document.strokes.length} Strokes · ${flowerCount} Flower · ${petalCount} petals · ${state.graph.edges.length} edges`;
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
  };

  const setState = (next: HanaAuthoringUiState, message?: string) => {
    state = next;
    history = new HanaUndoRedo(next.document);
    render(message);
  };

  loadButton.addEventListener("click", () => {
    const study = createHanaAuthoringStudy();
    setState({
      document: study.document,
      flowers: study.flowers,
      graph: study.graph,
      bridge: study.bridge,
    }, "Study loaded · document → Flower → Graph → Bridge ready");
  });

  saveButton.addEventListener("click", () => {
    if (!state) return;
    downloadJson("hana-authoring-study-v0.json", studyPayload(state));
    render("Study saved · derived geometry excluded");
  });

  loadJsonButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      setState(readStudyPayload(JSON.parse(await file.text())), "Study reloaded · semantic data validated");
    } catch (error) {
      render(`Load failed · ${error instanceof Error ? error.message : "invalid JSON"}`);
    }
  });

  exportBridgeButton.addEventListener("click", () => {
    if (!state) return;
    downloadJson("hana-skin-bridge-v0.json", JSON.parse(serializeHanaSkinBridge(state.bridge)));
    render("Bridge exported · semantic data only");
  });

  undoButton.addEventListener("click", () => {
    if (!state || !history) return;
    const document = history.undo();
    if (!document) return;
    state = { ...state, document, bridge: exportHanaSkinBridge({ document, flowers: state.flowers, graph: state.graph }) };
    render("Authoring Undo");
  });

  redoButton.addEventListener("click", () => {
    if (!state || !history) return;
    const document = history.redo();
    if (!document) return;
    state = { ...state, document, bridge: exportHanaSkinBridge({ document, flowers: state.flowers, graph: state.graph }) };
    render("Authoring Redo");
  });

  (window as HanaAuthoringWindow).__HANA_AUTHORING__ = {
    loadStudy: () => {
      const study = createHanaAuthoringStudy();
      setState({ document: study.document, flowers: study.flowers, graph: study.graph, bridge: study.bridge });
      return state!;
    },
    exportBridge: () => state?.bridge ?? null,
    snapshot: () => state,
  };
}
