import {
  DEFAULT_SKIN_VIEW_DIRECTIONS,
  skinViewAxisLegend,
  skinViewDirectionLabel,
  skinViewportAtPoint,
  skinViewportRects,
  type SkinViewportRect,
} from "../skin/multiViewport.ts";
import { resolveRhinoViewportGesture, type RhinoViewportGesture } from "../skin/rhinoViewportControls.ts";
import manifest from "./manifest.json";
import {
  HANA_VIEW_DIRECTIONS,
  createGesturePayload,
  pointerTypeFromBrowser,
  pressureDisplayWidth,
  pressureStats,
  type HanaEditorState,
  type HanaInteractionMode,
  type HanaPointerType,
  type HanaStrokePoint,
  type HanaViewDirection,
  type HanaViewportMode,
  type HanaViewportStroke,
} from "./gesture.ts";
import { HanaViewportRenderer } from "./viewportRenderer.ts";
import "./style.css";

const app = document.getElementById("app");
if (!app) throw new Error("#app was not found");

app.innerHTML = `
  <main class="hana-shell">
    <header class="hana-header">
      <div class="hana-heading">
        <h1>HANA — Four View Input Shell</h1>
        <p>HANA-1A · v${manifest.version} · updated ${manifest.updatedAt}</p>
      </div>
      <div class="hana-toolbar" aria-label="Viewport layout and gesture actions">
        <div class="hana-segmented" aria-label="Viewport layout">
          <button id="layout-four" type="button" aria-pressed="true">Four</button>
          <button id="layout-one" type="button" aria-pressed="false">One</button>
        </div>
        <button id="clear-gesture" type="button">Clear</button>
        <button id="save-gesture" type="button" class="hana-primary">Save JSON</button>
      </div>
    </header>

    <section class="hana-workspace" aria-label="HANA four viewport editor">
      <canvas id="scene-canvas" aria-hidden="true"></canvas>
      <canvas id="gesture-canvas" aria-label="HANA viewport gesture input"></canvas>
      <div id="viewport-chrome" aria-live="polite"></div>
      <div id="splitter-x" class="hana-splitter hana-splitter-x" role="separator" aria-label="Resize viewport columns" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="80" aria-valuenow="50"></div>
      <div id="splitter-y" class="hana-splitter hana-splitter-y" role="separator" aria-label="Resize viewport rows" aria-orientation="horizontal" aria-valuemin="20" aria-valuemax="80" aria-valuenow="50"></div>
    </section>

    <footer class="hana-debug">
      <dl>
        <div><dt>pointerType</dt><dd id="debug-pointer">—</dd></div>
        <div><dt>pressure</dt><dd id="debug-pressure">0.0000</dd></div>
        <div><dt>x / y</dt><dd id="debug-position">— / —</dd></div>
        <div><dt>viewport</dt><dd id="debug-viewport">Front</dd></div>
        <div><dt>current points</dt><dd id="debug-points">0</dd></div>
        <div><dt>all strokes</dt><dd id="debug-strokes">0</dd></div>
        <div><dt>last pressure</dt><dd id="debug-range">—</dd></div>
      </dl>
      <p id="input-state">READY · Raw Gesture is separate from camera and layout state</p>
    </footer>
  </main>
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required HANA element was not found: ${selector}`);
  return element;
}

const workspace = requiredElement<HTMLElement>(".hana-workspace");
const sceneCanvas = requiredElement<HTMLCanvasElement>("#scene-canvas");
const gestureCanvas = requiredElement<HTMLCanvasElement>("#gesture-canvas");
const chrome = requiredElement<HTMLElement>("#viewport-chrome");
const splitterX = requiredElement<HTMLElement>("#splitter-x");
const splitterY = requiredElement<HTMLElement>("#splitter-y");
const layoutFourButton = requiredElement<HTMLButtonElement>("#layout-four");
const layoutOneButton = requiredElement<HTMLButtonElement>("#layout-one");
const clearButton = requiredElement<HTMLButtonElement>("#clear-gesture");
const saveButton = requiredElement<HTMLButtonElement>("#save-gesture");

const renderer = new HanaViewportRenderer(sceneCanvas, HANA_VIEW_DIRECTIONS);
const gestureContext = gestureCanvas.getContext("2d") ?? (() => {
  throw new Error("HANA gesture canvas 2D context is unavailable");
})();

const directions = DEFAULT_SKIN_VIEW_DIRECTIONS as readonly HanaViewDirection[];
let viewportMode: HanaViewportMode = "four";
let selectedViewport = 2;
let split = { x: 0.5, y: 0.5 };
const interactionModes: HanaInteractionMode[] = ["edit", "view", "draw", "edit"];
const strokes: HanaViewportStroke[] = [];
let strokeCounter = 0;
let gesturePixelRatio = 1;

interface ActiveStroke {
  pointerId: number;
  startTime: number;
  stroke: HanaViewportStroke;
  rect: SkinViewportRect;
}

interface CameraDrag {
  pointerId: number;
  viewportIndex: number;
  gesture: RhinoViewportGesture;
  previousX: number;
  previousY: number;
  rect: SkinViewportRect;
}

let activeStroke: ActiveStroke | null = null;
let cameraDrag: CameraDrag | null = null;

function viewportId(index: number): string {
  const direction = directions[index];
  if (!direction) throw new Error(`Unknown HANA viewport index: ${index}`);
  return `viewport-${direction}`;
}

function currentRects(): SkinViewportRect[] {
  return skinViewportRects(
    workspace.clientWidth,
    workspace.clientHeight,
    viewportMode,
    selectedViewport,
    split,
  );
}

function canvasPoint(event: PointerEvent): { x: number; y: number } {
  const bounds = gestureCanvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function setDebugText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updateDebug(
  point: HanaStrokePoint | null,
  pointerType: HanaPointerType | null,
  stroke: HanaViewportStroke | null,
): void {
  setDebugText("debug-pointer", pointerType ?? "—");
  setDebugText("debug-pressure", point ? point.pressure.toFixed(4) : "0.0000");
  setDebugText("debug-position", point ? `${point.x.toFixed(1)} / ${point.y.toFixed(1)}` : "— / —");
  setDebugText("debug-viewport", skinViewDirectionLabel(directions[selectedViewport]));
  setDebugText("debug-points", String(stroke?.points.length ?? 0));
  setDebugText("debug-strokes", String(strokes.length));
  const stats = pressureStats(stroke ?? strokes[strokes.length - 1] ?? null);
  setDebugText(
    "debug-range",
    stats ? `${stats.min.toFixed(4)}–${stats.max.toFixed(4)} · ${stats.distinct}` : "—",
  );
  setDebugText(
    "input-state",
    activeStroke
      ? "RECORDING · camera input is disabled for this Draw stroke"
      : "READY · Raw Gesture is separate from camera and layout state",
  );
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: HanaViewportStroke,
  rect: SkinViewportRect,
): void {
  if (stroke.points.length === 0) return;
  const scaleX = rect.width / Math.max(1, stroke.viewportSize.width);
  const scaleY = rect.height / Math.max(1, stroke.viewportSize.height);

  const position = (point: HanaStrokePoint) => ({
    x: rect.x + point.x * scaleX,
    y: rect.y + point.y * scaleY,
  });

  const first = stroke.points[0];
  const firstPosition = position(first);
  context.beginPath();
  context.arc(firstPosition.x, firstPosition.y, pressureDisplayWidth(first.pressure) / 2, 0, Math.PI * 2);
  context.fill();

  for (let index = 1; index < stroke.points.length; index += 1) {
    const from = stroke.points[index - 1];
    const to = stroke.points[index];
    const fromPosition = position(from);
    const toPosition = position(to);
    context.beginPath();
    context.moveTo(fromPosition.x, fromPosition.y);
    context.lineTo(toPosition.x, toPosition.y);
    context.lineWidth = pressureDisplayWidth((from.pressure + to.pressure) / 2);
    context.stroke();
  }
}

function redrawGestures(): void {
  const width = workspace.clientWidth;
  const height = workspace.clientHeight;
  gestureContext.setTransform(gesturePixelRatio, 0, 0, gesturePixelRatio, 0, 0);
  gestureContext.clearRect(0, 0, width, height);
  gestureContext.strokeStyle = "#111827";
  gestureContext.fillStyle = "#111827";
  gestureContext.lineCap = "round";
  gestureContext.lineJoin = "round";

  for (const rect of currentRects()) {
    const id = viewportId(rect.index);
    gestureContext.save();
    gestureContext.beginPath();
    gestureContext.rect(rect.x, rect.y, rect.width, rect.height);
    gestureContext.clip();
    for (const stroke of strokes) {
      if (stroke.viewportId === id) drawStroke(gestureContext, stroke, rect);
    }
    gestureContext.restore();
  }
}

function modeOptions(index: number): readonly HanaInteractionMode[] {
  return directions[index] === "axome" ? ["view", "edit"] : ["draw", "edit"];
}

function renderViewportChrome(): void {
  chrome.textContent = "";
  for (const rect of currentRects()) {
    const direction = directions[rect.index];
    const pane = document.createElement("section");
    pane.className = `hana-viewport-pane${rect.index === selectedViewport ? " is-selected" : ""}`;
    pane.style.left = `${rect.x}px`;
    pane.style.top = `${rect.y}px`;
    pane.style.width = `${rect.width}px`;
    pane.style.height = `${rect.height}px`;
    pane.dataset.viewportId = viewportId(rect.index);

    const identity = document.createElement("div");
    identity.className = "hana-view-identity";
    identity.innerHTML = `<strong>${skinViewDirectionLabel(direction)}</strong><span>${skinViewAxisLegend(direction)}</span>`;
    pane.appendChild(identity);

    const modes = document.createElement("div");
    modes.className = "hana-mode-switch";
    modes.setAttribute("aria-label", `${skinViewDirectionLabel(direction)} interaction mode`);
    for (const mode of modeOptions(rect.index)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = mode[0].toUpperCase() + mode.slice(1);
      button.dataset.viewportIndex = String(rect.index);
      button.dataset.interactionMode = mode;
      button.setAttribute("aria-pressed", String(interactionModes[rect.index] === mode));
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", () => {
        interactionModes[rect.index] = mode;
        selectedViewport = rect.index;
        refreshLayout();
        updateDebug(null, null, null);
      });
      modes.appendChild(button);
    }
    pane.appendChild(modes);

    if (interactionModes[rect.index] === "draw" && !strokes.some((stroke) => stroke.viewportId === viewportId(rect.index))) {
      const hint = document.createElement("span");
      hint.className = "hana-draw-hint";
      hint.textContent = "DRAW HERE";
      pane.appendChild(hint);
    }
    chrome.appendChild(pane);
  }
}

function updateSplitters(): void {
  const visible = viewportMode === "four";
  splitterX.hidden = !visible;
  splitterY.hidden = !visible;
  if (!visible) return;
  splitterX.style.left = `${workspace.clientWidth * split.x}px`;
  splitterY.style.top = `${workspace.clientHeight * split.y}px`;
  splitterX.setAttribute("aria-valuenow", String(Math.round(split.x * 100)));
  splitterY.setAttribute("aria-valuenow", String(Math.round(split.y * 100)));
}

function updateLayoutButtons(): void {
  layoutFourButton.setAttribute("aria-pressed", String(viewportMode === "four"));
  layoutOneButton.setAttribute("aria-pressed", String(viewportMode === "one"));
}

function renderScene(): void {
  renderer.render(currentRects(), selectedViewport);
}

function refreshLayout(): void {
  renderScene();
  redrawGestures();
  renderViewportChrome();
  updateSplitters();
  updateLayoutButtons();
}

function resize(): void {
  const width = Math.max(1, workspace.clientWidth);
  const height = Math.max(1, workspace.clientHeight);
  gesturePixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  gestureCanvas.width = Math.round(width * gesturePixelRatio);
  gestureCanvas.height = Math.round(height * gesturePixelRatio);
  renderer.resize(width, height);
  refreshLayout();
}

function pointFromSample(sample: PointerEvent, active: ActiveStroke): HanaStrokePoint {
  const bounds = gestureCanvas.getBoundingClientRect();
  return {
    x: sample.clientX - bounds.left - active.rect.x,
    y: sample.clientY - bounds.top - active.rect.y,
    pressure: sample.pressure,
    time: Math.max(0, sample.timeStamp - active.startTime),
  };
}

function appendSamples(event: PointerEvent): void {
  if (!activeStroke || event.pointerId !== activeStroke.pointerId) return;
  const coalesced = event.getCoalescedEvents?.() ?? [];
  const samples = coalesced.length > 0 ? coalesced : [event];
  let latest: HanaStrokePoint | null = null;
  for (const sample of samples) {
    latest = pointFromSample(sample, activeStroke);
    activeStroke.stroke.points.push(latest);
  }
  redrawGestures();
  if (latest) updateDebug(latest, activeStroke.stroke.pointerType, activeStroke.stroke);
}

function startStroke(event: PointerEvent, rect: SkinViewportRect): void {
  if (!event.isPrimary || activeStroke || cameraDrag) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  gestureCanvas.setPointerCapture(event.pointerId);
  strokeCounter += 1;
  const direction = directions[rect.index];
  const stroke: HanaViewportStroke = {
    id: `stroke-${strokeCounter}`,
    viewportId: viewportId(rect.index),
    viewDirection: direction,
    pointerType: pointerTypeFromBrowser(event.pointerType),
    viewportSize: { width: rect.width, height: rect.height },
    points: [],
  };
  strokes.push(stroke);
  activeStroke = {
    pointerId: event.pointerId,
    startTime: event.timeStamp,
    stroke,
    rect: { ...rect },
  };
  const point = pointFromSample(event, activeStroke);
  stroke.points.push(point);
  redrawGestures();
  renderViewportChrome();
  updateDebug(point, stroke.pointerType, stroke);
}

function startCameraDrag(event: PointerEvent, rect: SkinViewportRect): void {
  if (!event.isPrimary || activeStroke || cameraDrag) return;
  if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) return;
  event.preventDefault();
  gestureCanvas.setPointerCapture(event.pointerId);
  cameraDrag = {
    pointerId: event.pointerId,
    viewportIndex: rect.index,
    gesture: resolveRhinoViewportGesture(directions[rect.index], {
      shiftKey: event.shiftKey,
      metaKey: event.metaKey || event.ctrlKey,
    }),
    previousX: event.clientX,
    previousY: event.clientY,
    rect: { ...rect },
  };
}

function endPointer(pointerId: number, releaseCapture: boolean): void {
  if (activeStroke?.pointerId === pointerId) {
    const finished = activeStroke.stroke;
    activeStroke = null;
    updateDebug(finished.points[finished.points.length - 1] ?? null, finished.pointerType, finished);
  }
  if (cameraDrag?.pointerId === pointerId) cameraDrag = null;
  if (releaseCapture && gestureCanvas.hasPointerCapture(pointerId)) {
    gestureCanvas.releasePointerCapture(pointerId);
  }
}

gestureCanvas.addEventListener("pointerdown", (event) => {
  const point = canvasPoint(event);
  const rect = skinViewportAtPoint(
    point.x,
    point.y,
    workspace.clientWidth,
    workspace.clientHeight,
    viewportMode,
    selectedViewport,
    split,
  );
  if (!rect) return;
  selectedViewport = rect.index;
  renderViewportChrome();
  renderScene();
  updateDebug(null, null, null);
  if (interactionModes[rect.index] === "draw") startStroke(event, rect);
  else startCameraDrag(event, rect);
});

gestureCanvas.addEventListener("pointermove", (event) => {
  if (activeStroke?.pointerId === event.pointerId) {
    event.preventDefault();
    appendSamples(event);
    return;
  }
  if (!cameraDrag || cameraDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  renderer.applyDrag(
    cameraDrag.viewportIndex,
    cameraDrag.gesture,
    event.clientX - cameraDrag.previousX,
    event.clientY - cameraDrag.previousY,
    cameraDrag.rect.width,
    cameraDrag.rect.height,
  );
  cameraDrag.previousX = event.clientX;
  cameraDrag.previousY = event.clientY;
  renderScene();
});

gestureCanvas.addEventListener("pointerup", (event) => endPointer(event.pointerId, true));
gestureCanvas.addEventListener("pointercancel", (event) => endPointer(event.pointerId, true));
gestureCanvas.addEventListener("lostpointercapture", (event) => endPointer(event.pointerId, false));
gestureCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
gestureCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const point = { x: event.clientX - gestureCanvas.getBoundingClientRect().left, y: event.clientY - gestureCanvas.getBoundingClientRect().top };
  const rect = skinViewportAtPoint(
    point.x,
    point.y,
    workspace.clientWidth,
    workspace.clientHeight,
    viewportMode,
    selectedViewport,
    split,
  );
  if (!rect || interactionModes[rect.index] === "draw") return;
  selectedViewport = rect.index;
  renderer.applyDrag(rect.index, "zoom", 0, event.deltaY * 0.12, rect.width, rect.height);
  renderScene();
  renderViewportChrome();
  updateDebug(null, null, null);
}, { passive: false });

function beginSplitterDrag(event: PointerEvent, axis: "x" | "y"): void {
  event.preventDefault();
  const splitter = axis === "x" ? splitterX : splitterY;
  splitter.classList.add("is-dragging");
  splitter.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const bounds = workspace.getBoundingClientRect();
    if (axis === "x") split = { ...split, x: (moveEvent.clientX - bounds.left) / Math.max(1, bounds.width) };
    else split = { ...split, y: (moveEvent.clientY - bounds.top) / Math.max(1, bounds.height) };
    split.x = Math.max(0.2, Math.min(0.8, split.x));
    split.y = Math.max(0.2, Math.min(0.8, split.y));
    refreshLayout();
  };
  const end = (endEvent: PointerEvent) => {
    if (endEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    splitter.classList.remove("is-dragging");
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

splitterX.addEventListener("pointerdown", (event) => beginSplitterDrag(event, "x"));
splitterY.addEventListener("pointerdown", (event) => beginSplitterDrag(event, "y"));

layoutFourButton.addEventListener("click", () => {
  viewportMode = "four";
  refreshLayout();
});

layoutOneButton.addEventListener("click", () => {
  viewportMode = "one";
  refreshLayout();
});

clearButton.addEventListener("click", () => {
  strokes.length = 0;
  activeStroke = null;
  cameraDrag = null;
  strokeCounter = 0;
  redrawGestures();
  renderViewportChrome();
  updateDebug(null, null, null);
});

function captureEditorState(): HanaEditorState {
  return {
    viewportMode,
    selectedViewportId: viewportId(selectedViewport),
    split: { ...split },
    viewports: directions.map((direction, index) => ({
      id: viewportId(index),
      viewDirection: direction,
      interactionMode: interactionModes[index],
      camera: renderer.cameraState(index),
    })),
  };
}

function snapshot() {
  return createGesturePayload(strokes, captureEditorState());
}

saveButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `hana-1a-gesture-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

type HanaProbeWindow = Window & {
  __HANA_1A__?: {
    snapshot: typeof snapshot;
  };
};

(window as HanaProbeWindow).__HANA_1A__ = { snapshot };

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(workspace);
window.addEventListener("beforeunload", () => {
  resizeObserver.disconnect();
  renderer.dispose();
});

resize();
updateDebug(null, null, null);
