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
  pointerTypeFromBrowser,
  pressureStats,
  type HanaEditorState,
  type HanaInteractionMode,
  type HanaPointerType,
  type HanaSoftEditStrength,
  type HanaStrokePoint,
  type HanaViewDirection,
  type HanaViewportMode,
  type HanaViewportStroke,
} from "./gesture.ts";
import {
  createHanaDocument,
  deriveStroke3D,
  type HanaStroke3D,
} from "./stroke3d.ts";
import {
  applySoftViewportEdit,
  editorStrokeColor,
  sampleSmoothCenterline,
  strokeBounds,
  type HanaStrokeBounds,
} from "./smoothCenterline.ts";
import { HanaViewportRenderer } from "./viewportRenderer.ts";
import "./style.css";

const app = document.getElementById("app");
if (!app) throw new Error("#app was not found");

app.innerHTML = `
  <main class="hana-shell">
    <header class="hana-header">
      <div class="hana-heading">
        <h1>HANA — Smooth 3D Stroke</h1>
        <p>HANA-1C · v${manifest.version} · updated ${manifest.updatedAt}</p>
      </div>
      <div class="hana-toolbar" aria-label="Viewport layout and document actions">
        <div class="hana-segmented" aria-label="Viewport layout">
          <button id="layout-four" type="button" aria-pressed="true">Four</button>
          <button id="layout-one" type="button" aria-pressed="false">One</button>
        </div>
        <div class="hana-soft-control" aria-label="Soft Edit strength">
          <span>Soft</span>
          <div class="hana-segmented">
            <button type="button" data-soft-edit="off" aria-pressed="false">OFF</button>
            <button type="button" data-soft-edit="low" aria-pressed="false">LOW</button>
            <button type="button" data-soft-edit="medium" aria-pressed="true">MEDIUM</button>
          </div>
        </div>
        <label class="hana-smooth-control" for="smoothness-control">
          <span>Smoothness</span>
          <span class="hana-smooth-bound">0.00</span>
          <input id="smoothness-control" type="range" min="0" max="1" step="0.01" value="0" aria-label="Smoothness" />
          <span class="hana-smooth-bound">1.00</span>
          <output id="smoothness-value" for="smoothness-control">0.00</output>
        </label>
        <button id="clear-document" type="button">Clear</button>
        <button id="save-document" type="button" class="hana-primary">Save JSON</button>
      </div>
    </header>

    <section class="hana-workspace" aria-label="HANA smooth 3D stroke editor">
      <canvas id="scene-canvas" aria-hidden="true"></canvas>
      <canvas id="gesture-canvas" aria-label="HANA shared 3D stroke input"></canvas>
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
        <div><dt>raw points</dt><dd id="debug-points">0</dd></div>
        <div><dt>3D controls</dt><dd id="debug-controls">0</dd></div>
        <div><dt>smooth samples</dt><dd id="debug-smooth">0</dd></div>
        <div><dt>soft / affected</dt><dd id="debug-soft">MEDIUM / 0</dd></div>
        <div><dt>selected XYZ</dt><dd id="debug-xyz">—</dd></div>
        <div><dt>raw pressure</dt><dd id="debug-range">—</dd></div>
      </dl>
      <p id="input-state">READY · Draw one Stroke in Front, Right, or Top</p>
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
const clearButton = requiredElement<HTMLButtonElement>("#clear-document");
const saveButton = requiredElement<HTMLButtonElement>("#save-document");
const softEditButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-soft-edit]"));
const smoothnessSlider = requiredElement<HTMLInputElement>("#smoothness-control");
const smoothnessValue = requiredElement<HTMLOutputElement>("#smoothness-value");

const renderer = new HanaViewportRenderer(sceneCanvas, HANA_VIEW_DIRECTIONS);
const gestureContext = gestureCanvas.getContext("2d") ?? (() => {
  throw new Error("HANA gesture canvas 2D context is unavailable");
})();

const directions = DEFAULT_SKIN_VIEW_DIRECTIONS as readonly HanaViewDirection[];
let viewportMode: HanaViewportMode = "four";
let selectedViewport = 2;
let split = { x: 0.5, y: 0.5 };
const interactionModes: HanaInteractionMode[] = ["edit", "view", "draw", "edit"];
const rawGestures: HanaViewportStroke[] = [];
let stroke3D: HanaStroke3D | null = null;
let selectedControlPoint: number | null = null;
let softEditStrength: HanaSoftEditStrength = "medium";
let smoothness = 0;
let lastAffectedControlIndices: number[] = [];
let lastEditBoundsBefore: HanaStrokeBounds | null = null;
let lastEditBoundsAfter: HanaStrokeBounds | null = null;
let gesturePixelRatio = 1;
let stateMessage = "READY · Draw one Stroke in Front, Right, or Top";

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

interface ControlDrag {
  pointerId: number;
  viewportIndex: number;
  direction: Exclude<HanaViewDirection, "axome">;
  controlIndex: number;
  rect: SkinViewportRect;
  boundsBefore: HanaStrokeBounds | null;
  rawSignatureBefore: string;
}

let activeStroke: ActiveStroke | null = null;
let cameraDrag: CameraDrag | null = null;
let controlDrag: ControlDrag | null = null;

function viewportId(index: number): string {
  const direction = directions[index];
  if (!direction) throw new Error(`Unknown HANA viewport index: ${index}`);
  return `viewport-${direction}`;
}

function currentRects(): SkinViewportRect[] {
  return skinViewportRects(workspace.clientWidth, workspace.clientHeight, viewportMode, selectedViewport, split);
}

function canvasPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const bounds = gestureCanvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function setDebugText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function rawSignature(): string {
  const stroke = rawGestures[0];
  if (!stroke) return "empty";
  let pressureTotal = 0;
  let timeTotal = 0;
  for (const point of stroke.points) {
    pressureTotal += point.pressure;
    timeTotal += point.time;
  }
  return `${stroke.id}:${stroke.points.length}:${pressureTotal.toFixed(8)}:${timeTotal.toFixed(3)}`;
}

function boundsSignature(bounds: HanaStrokeBounds | null): string {
  if (!bounds) return "";
  return [
    bounds.min.x, bounds.min.y, bounds.min.z,
    bounds.max.x, bounds.max.y, bounds.max.z,
  ].join(",");
}

function updateDebug(
  point: HanaStrokePoint | null = null,
  pointerType: HanaPointerType | null = null,
  stroke: HanaViewportStroke | null = null,
): void {
  const selected = selectedControlPoint === null ? null : stroke3D?.controlPoints[selectedControlPoint] ?? null;
  setDebugText("debug-pointer", pointerType ?? rawGestures[0]?.pointerType ?? "—");
  setDebugText("debug-pressure", point ? point.pressure.toFixed(4) : "0.0000");
  setDebugText("debug-position", point ? `${point.x.toFixed(1)} / ${point.y.toFixed(1)}` : "— / —");
  setDebugText("debug-viewport", skinViewDirectionLabel(directions[selectedViewport]));
  setDebugText("debug-points", String(stroke?.points.length ?? rawGestures[0]?.points.length ?? 0));
  setDebugText("debug-controls", String(stroke3D?.controlPoints.length ?? 0));
  setDebugText("debug-smooth", String(stroke3D ? sampleSmoothCenterline(stroke3D).length : 0));
  setDebugText("debug-soft", `${softEditStrength.toUpperCase()} / ${lastAffectedControlIndices.length}`);
  setDebugText("debug-xyz", selected
    ? `${selected.position.x.toFixed(3)}, ${selected.position.y.toFixed(3)}, ${selected.position.z.toFixed(3)}`
    : "—");
  const stats = pressureStats(stroke ?? rawGestures[0] ?? null);
  setDebugText("debug-range", stats ? `${stats.min.toFixed(4)}–${stats.max.toFixed(4)} · ${stats.distinct}` : "—");
  setDebugText("input-state", activeStroke
    ? "RECORDING · camera input is disabled"
    : controlDrag ? `EDITING · control ${controlDrag.controlIndex + 1} · Raw Gesture locked`
      : stateMessage);
  workspace.dataset.rawGestureCount = String(rawGestures.length);
  workspace.dataset.rawPointCount = String(rawGestures[0]?.points.length ?? 0);
  workspace.dataset.stroke3dCount = String(stroke3D ? 1 : 0);
  workspace.dataset.controlPointCount = String(stroke3D?.controlPoints.length ?? 0);
  workspace.dataset.smoothPointCount = String(stroke3D ? sampleSmoothCenterline(stroke3D).length : 0);
  workspace.dataset.softEditStrength = softEditStrength;
  workspace.dataset.lastAffectedCount = String(lastAffectedControlIndices.length);
  workspace.dataset.lastAffectedIndices = lastAffectedControlIndices.join(",");
  workspace.dataset.lastEditBoundsBefore = boundsSignature(lastEditBoundsBefore);
  workspace.dataset.lastEditBoundsAfter = boundsSignature(lastEditBoundsAfter);
  workspace.dataset.selectedControlPoint = selectedControlPoint === null ? "" : String(selectedControlPoint);
  workspace.dataset.selectedXyz = selected
    ? `${selected.position.x},${selected.position.y},${selected.position.z}`
    : "";
  workspace.dataset.rawSignature = rawSignature();
}

function drawRawGesture(stroke: HanaViewportStroke, rect: SkinViewportRect): void {
  if (stroke.points.length === 0) return;
  const scaleX = rect.width / Math.max(1, stroke.viewportSize.width);
  const scaleY = rect.height / Math.max(1, stroke.viewportSize.height);
  const position = (point: HanaStrokePoint) => ({ x: rect.x + point.x * scaleX, y: rect.y + point.y * scaleY });
  gestureContext.strokeStyle = "rgba(17, 24, 39, 0.18)";
  gestureContext.fillStyle = "rgba(17, 24, 39, 0.18)";
  const first = stroke.points[0];
  const firstPosition = position(first);
  gestureContext.beginPath();
  gestureContext.arc(firstPosition.x, firstPosition.y, 1, 0, Math.PI * 2);
  gestureContext.fill();
  for (let index = 1; index < stroke.points.length; index += 1) {
    const from = stroke.points[index - 1];
    const to = stroke.points[index];
    const fromPosition = position(from);
    const toPosition = position(to);
    gestureContext.beginPath();
    gestureContext.moveTo(fromPosition.x, fromPosition.y);
    gestureContext.lineTo(toPosition.x, toPosition.y);
    gestureContext.lineWidth = 1.5;
    gestureContext.stroke();
  }
}

function drawSharedStroke(rect: SkinViewportRect): void {
  if (!stroke3D || stroke3D.controlPoints.length === 0) return;
  const color = editorStrokeColor(stroke3D.id);
  const smooth = sampleSmoothCenterline(stroke3D);
  const smoothProjected = smooth.map((point) => renderer.projectPoint(rect.index, point.position, rect));
  const controlProjected = stroke3D.controlPoints.map((point) => renderer.projectPoint(rect.index, point.position, rect));
  gestureContext.strokeStyle = color;
  gestureContext.lineWidth = 2.5;
  gestureContext.beginPath();
  gestureContext.moveTo(smoothProjected[0].x, smoothProjected[0].y);
  for (let index = 1; index < smoothProjected.length; index += 1) {
    gestureContext.lineTo(smoothProjected[index].x, smoothProjected[index].y);
  }
  gestureContext.stroke();
  if (directions[rect.index] === "axome" || interactionModes[rect.index] !== "edit") return;

  gestureContext.strokeStyle = `${color}38`;
  gestureContext.lineWidth = 1;
  gestureContext.beginPath();
  gestureContext.moveTo(controlProjected[0].x, controlProjected[0].y);
  for (let index = 1; index < controlProjected.length; index += 1) {
    gestureContext.lineTo(controlProjected[index].x, controlProjected[index].y);
  }
  gestureContext.stroke();

  for (let index = 0; index < controlProjected.length; index += 1) {
    const point = controlProjected[index];
    const selected = index === selectedControlPoint;
    gestureContext.beginPath();
    gestureContext.arc(point.x, point.y, selected ? 5.5 : 3.5, 0, Math.PI * 2);
    gestureContext.fillStyle = selected ? color : "#ffffff";
    gestureContext.fill();
    gestureContext.strokeStyle = selected ? "#ffffff" : color;
    gestureContext.lineWidth = selected ? 2 : 1.25;
    gestureContext.stroke();
  }
}

function redrawOverlay(): void {
  const width = workspace.clientWidth;
  const height = workspace.clientHeight;
  gestureContext.setTransform(gesturePixelRatio, 0, 0, gesturePixelRatio, 0, 0);
  gestureContext.clearRect(0, 0, width, height);
  gestureContext.lineCap = "round";
  gestureContext.lineJoin = "round";
  for (const rect of currentRects()) {
    gestureContext.save();
    gestureContext.beginPath();
    gestureContext.rect(rect.x, rect.y, rect.width, rect.height);
    gestureContext.clip();
    const source = rawGestures[0];
    if (source?.viewportId === viewportId(rect.index)) drawRawGesture(source, rect);
    drawSharedStroke(rect);
    gestureContext.restore();
  }
}

function modeOptions(index: number): readonly HanaInteractionMode[] {
  return directions[index] === "axome" ? ["view"] : ["draw", "edit"];
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
      button.disabled = mode === "draw" && stroke3D !== null;
      if (button.disabled) button.title = "HANA-1C supports one Stroke. Clear before drawing another.";
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", () => {
        interactionModes[rect.index] = mode;
        selectedViewport = rect.index;
        selectedControlPoint = null;
        stateMessage = mode === "draw"
          ? `DRAW · ${skinViewDirectionLabel(direction)} creates a new Stroke3D`
          : `EDIT · Soft ${softEditStrength.toUpperCase()} · drag a control point`;
        refreshLayout();
        updateDebug();
      });
      modes.appendChild(button);
    }
    pane.appendChild(modes);
    if (interactionModes[rect.index] === "draw" && !stroke3D) {
      const hint = document.createElement("span");
      hint.className = "hana-draw-hint";
      hint.textContent = "DRAW ONE STROKE";
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

function updateSoftEditButtons(): void {
  for (const button of softEditButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.softEdit === softEditStrength));
  }
}

function renderScene(): void {
  renderer.render(currentRects(), selectedViewport);
}

function refreshLayout(): void {
  renderScene();
  redrawOverlay();
  renderViewportChrome();
  updateSplitters();
  updateLayoutButtons();
  updateSoftEditButtons();
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
  redrawOverlay();
  if (latest) updateDebug(latest, activeStroke.stroke.pointerType, activeStroke.stroke);
}

function startStroke(event: PointerEvent, rect: SkinViewportRect): void {
  if (!event.isPrimary || activeStroke || cameraDrag || controlDrag || stroke3D) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const direction = directions[rect.index];
  if (direction === "axome") return;
  event.preventDefault();
  gestureCanvas.setPointerCapture(event.pointerId);
  const stroke: HanaViewportStroke = {
    id: "gesture-1",
    viewportId: viewportId(rect.index),
    viewDirection: direction,
    pointerType: pointerTypeFromBrowser(event.pointerType),
    viewportSize: { width: rect.width, height: rect.height },
    points: [],
  };
  rawGestures.push(stroke);
  activeStroke = { pointerId: event.pointerId, startTime: event.timeStamp, stroke, rect: { ...rect } };
  const point = pointFromSample(event, activeStroke);
  stroke.points.push(point);
  redrawOverlay();
  renderViewportChrome();
  updateDebug(point, stroke.pointerType, stroke);
}

function finishStroke(): void {
  if (!activeStroke) return;
  const finished = activeStroke;
  const direction = finished.stroke.viewDirection;
  if (direction === "axome") throw new Error("Axome Draw is outside HANA-1C");
  stroke3D = deriveStroke3D(finished.stroke, (point) => {
    const world = renderer.pointOnViewPlane(
      finished.rect.index,
      finished.rect.x + point.x,
      finished.rect.y + point.y,
      finished.rect,
      direction,
      0,
    );
    if (!world) throw new Error(`Could not project ${direction} gesture onto its initial plane`);
    return world;
  });
  stroke3D.curve.smoothness = smoothness;
  activeStroke = null;
  interactionModes[0] = "edit";
  interactionModes[2] = "edit";
  interactionModes[3] = "edit";
  selectedControlPoint = Math.floor(stroke3D.controlPoints.length / 2);
  lastAffectedControlIndices = [];
  lastEditBoundsBefore = null;
  lastEditBoundsAfter = null;
  stateMessage = `SMOOTH CENTERLINE READY · ${sampleSmoothCenterline(stroke3D).length} samples`;
  refreshLayout();
  updateDebug(
    finished.stroke.points[finished.stroke.points.length - 1] ?? null,
    finished.stroke.pointerType,
    finished.stroke,
  );
}

function nearestControlIndex(rect: SkinViewportRect, x: number, y: number): number | null {
  if (!stroke3D) return null;
  let bestIndex: number | null = null;
  let bestDistance = 12;
  stroke3D.controlPoints.forEach((point, index) => {
    const projected = renderer.projectPoint(rect.index, point.position, rect);
    const distance = Math.hypot(projected.x - x, projected.y - y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function startControlDrag(event: PointerEvent, rect: SkinViewportRect, controlIndex: number): void {
  const direction = directions[rect.index];
  if (direction === "axome" || !stroke3D) return;
  event.preventDefault();
  gestureCanvas.setPointerCapture(event.pointerId);
  selectedControlPoint = controlIndex;
  lastAffectedControlIndices = [];
  lastEditBoundsBefore = strokeBounds(stroke3D);
  lastEditBoundsAfter = lastEditBoundsBefore;
  controlDrag = {
    pointerId: event.pointerId,
    viewportIndex: rect.index,
    direction,
    controlIndex,
    rect: { ...rect },
    boundsBefore: lastEditBoundsBefore,
    rawSignatureBefore: rawSignature(),
  };
  updateDebug();
  redrawOverlay();
}

function updateControlDrag(event: PointerEvent): void {
  if (!controlDrag || !stroke3D || controlDrag.pointerId !== event.pointerId) return;
  const point = stroke3D.controlPoints[controlDrag.controlIndex];
  const planeValue = controlDrag.direction === "front"
    ? point.position.y
    : controlDrag.direction === "right" ? point.position.x : point.position.z;
  const canvas = canvasPoint(event);
  const world = renderer.pointOnViewPlane(
    controlDrag.viewportIndex,
    canvas.x,
    canvas.y,
    controlDrag.rect,
    controlDrag.direction,
    planeValue,
  );
  if (!world) return;
  const edit = applySoftViewportEdit(
    stroke3D,
    controlDrag.controlIndex,
    controlDrag.direction,
    world,
    softEditStrength,
  );
  if (rawSignature() !== controlDrag.rawSignatureBefore) {
    throw new Error("Soft Edit changed the immutable Raw Gesture");
  }
  lastAffectedControlIndices = edit.affectedControlIndices;
  lastEditBoundsBefore = controlDrag.boundsBefore;
  lastEditBoundsAfter = strokeBounds(stroke3D);
  stateMessage = `EDITED · ${softEditStrength.toUpperCase()} affected ${edit.affectedControlIndices.length} controls`;
  redrawOverlay();
  updateDebug();
}

function startCameraDrag(event: PointerEvent, rect: SkinViewportRect): void {
  if (!event.isPrimary || activeStroke || cameraDrag || controlDrag) return;
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
  if (activeStroke?.pointerId === pointerId) finishStroke();
  if (cameraDrag?.pointerId === pointerId) cameraDrag = null;
  if (controlDrag?.pointerId === pointerId) {
    controlDrag = null;
    updateDebug();
  }
  if (releaseCapture && gestureCanvas.hasPointerCapture(pointerId)) gestureCanvas.releasePointerCapture(pointerId);
}

gestureCanvas.addEventListener("pointerdown", (event) => {
  const point = canvasPoint(event);
  const rect = skinViewportAtPoint(point.x, point.y, workspace.clientWidth, workspace.clientHeight, viewportMode, selectedViewport, split);
  if (!rect) return;
  selectedViewport = rect.index;
  renderViewportChrome();
  renderScene();
  redrawOverlay();
  updateDebug();
  if (interactionModes[rect.index] === "draw") {
    startStroke(event, rect);
    return;
  }
  if (event.pointerType !== "mouse") return;
  if (interactionModes[rect.index] === "edit" && directions[rect.index] !== "axome") {
    const controlIndex = nearestControlIndex(rect, point.x, point.y);
    if (controlIndex !== null) {
      startControlDrag(event, rect, controlIndex);
      return;
    }
  }
  startCameraDrag(event, rect);
});

gestureCanvas.addEventListener("pointermove", (event) => {
  if (activeStroke?.pointerId === event.pointerId) {
    event.preventDefault();
    appendSamples(event);
    return;
  }
  if (controlDrag?.pointerId === event.pointerId) {
    event.preventDefault();
    updateControlDrag(event);
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
  redrawOverlay();
});

gestureCanvas.addEventListener("pointerup", (event) => endPointer(event.pointerId, true));
gestureCanvas.addEventListener("pointercancel", (event) => endPointer(event.pointerId, true));
gestureCanvas.addEventListener("lostpointercapture", (event) => endPointer(event.pointerId, false));
gestureCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
gestureCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const point = canvasPoint(event);
  const rect = skinViewportAtPoint(point.x, point.y, workspace.clientWidth, workspace.clientHeight, viewportMode, selectedViewport, split);
  if (!rect || interactionModes[rect.index] === "draw") return;
  selectedViewport = rect.index;
  renderer.applyDrag(rect.index, "zoom", 0, event.deltaY * 0.12, rect.width, rect.height);
  renderScene();
  redrawOverlay();
  renderViewportChrome();
  updateDebug();
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

layoutFourButton.addEventListener("click", () => { viewportMode = "four"; refreshLayout(); });
layoutOneButton.addEventListener("click", () => { viewportMode = "one"; refreshLayout(); });
for (const button of softEditButtons) {
  button.addEventListener("click", () => {
    const strength = button.dataset.softEdit;
    if (strength !== "off" && strength !== "low" && strength !== "medium") return;
    softEditStrength = strength;
    lastAffectedControlIndices = [];
    stateMessage = `SOFT EDIT · ${strength.toUpperCase()}`;
    updateSoftEditButtons();
    updateDebug();
  });
}

function updateSmoothnessUI(): void {
  const value = smoothness.toFixed(2);
  smoothnessSlider.value = value;
  smoothnessValue.value = value;
  smoothnessValue.textContent = value;
}

function setSmoothness(value: number): void {
  smoothness = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  if (stroke3D) {
    stroke3D.curve.smoothness = smoothness;
    stateMessage = `SMOOTHNESS · ${smoothness.toFixed(2)}`;
    redrawOverlay();
  }
  updateSmoothnessUI();
  updateDebug();
}

smoothnessSlider.addEventListener("input", () => {
  setSmoothness(Number(smoothnessSlider.value));
});

clearButton.addEventListener("click", () => {
  rawGestures.length = 0;
  stroke3D = null;
  activeStroke = null;
  cameraDrag = null;
  controlDrag = null;
  selectedControlPoint = null;
  lastAffectedControlIndices = [];
  lastEditBoundsBefore = null;
  lastEditBoundsAfter = null;
  setSmoothness(0);
  interactionModes[0] = "edit";
  interactionModes[1] = "view";
  interactionModes[2] = "draw";
  interactionModes[3] = "edit";
  stateMessage = "READY · Draw one Stroke in Front, Right, or Top";
  refreshLayout();
  updateDebug();
});

function captureEditorState(): HanaEditorState {
  return {
    viewportMode,
    selectedViewportId: viewportId(selectedViewport),
    split: { ...split },
    softEditStrength,
    viewports: directions.map((direction, index) => ({
      id: viewportId(index),
      viewDirection: direction,
      interactionMode: interactionModes[index],
      camera: renderer.cameraState(index),
    })),
  };
}

function snapshot() {
  return createHanaDocument(rawGestures, stroke3D ? [stroke3D] : [], captureEditorState());
}

saveButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `hana-1c-document-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

type HanaProbeWindow = Window & { __HANA_1C__?: { snapshot: typeof snapshot } };
(window as HanaProbeWindow).__HANA_1C__ = { snapshot };

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(workspace);
window.addEventListener("beforeunload", () => {
  resizeObserver.disconnect();
  renderer.dispose();
});

resize();
updateSmoothnessUI();
updateDebug();
