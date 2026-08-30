import {
  SKIN_REBUILD_WORKFLOW_PHASES,
  moveSkinRebuildWorkflowPhase,
} from "./workflowPhaseNavigator.ts";
import { SKIN_REBUILD_STAGE_CLASSIFICATION } from "./workflowInventory.ts";

export interface SkinArtUiPhase {
  readonly label: string;
  readonly targetId: string;
  readonly stageIds: readonly string[];
  readonly shortLabel: string;
  readonly description: string;
}

export const SKIN_ART_UI_PHASES: readonly SkinArtUiPhase[] = [
  {
    ...SKIN_REBUILD_WORKFLOW_PHASES[0],
    stageIds: ["skin-stage-1"],
    shortLabel: "FORM",
    description: "Shape the invisible host that carries the work.",
  },
  {
    ...SKIN_REBUILD_WORKFLOW_PHASES[1],
    stageIds: ["skin-stage-2"],
    shortLabel: "SURFACE",
    description: "Compose the surface as an authored field of motifs.",
  },
  {
    ...SKIN_REBUILD_WORKFLOW_PHASES[2],
    stageIds: ["skin-stage-3", "skin-stage-4", "skin-stage-5"],
    shortLabel: "STRUCTURE",
    description: "Build and inspect the work's connected structure.",
  },
  {
    ...SKIN_REBUILD_WORKFLOW_PHASES[3],
    stageIds: ["skin-stage-6", "skin-stage-7", "skin-stage-8"],
    shortLabel: "OUTPUT",
    description: "Validate the artwork, prepare support, and export.",
  },
] as const;

const STAGE_PRESENTATION = {
  "skin-stage-1": ["Base Shape", "Host form and source volume", "AVAILABLE"],
  "skin-stage-2": ["Surface Pattern", "Motif, placement and direct editing", "AVAILABLE"],
  "skin-stage-3": ["Artwork Graph", "Freeze the current surface relations", "DEVELOPING"],
  "skin-stage-4": ["Dry Web / Structure", "Generate and inspect the connected network", "DEVELOPING"],
  "skin-stage-5": ["Network Editing", "Review and refine structural connections", "DEVELOPING"],
  "skin-stage-6": ["Geometry / Mesh", "Realize the artwork as export geometry", "AVAILABLE"],
  "skin-stage-7": ["Artwork Check", "Read the current geometric evidence", "AVAILABLE"],
  "skin-stage-8": ["Print / Export", "Prepare separate support and output", "AVAILABLE"],
} as const;

export function skinArtUiPhaseIndexForStage(stageId: string): number | null {
  const index = SKIN_ART_UI_PHASES.findIndex((phase) => phase.stageIds.includes(stageId));
  return index >= 0 ? index : null;
}

export interface MountSkinArtUiShellOptions {
  readonly app: HTMLElement;
  readonly workflowRoot: HTMLElement;
  readonly rightPaneBody: HTMLElement;
  readonly viewport: HTMLElement;
  readonly version: string;
  readonly updatedAt: string;
}

function query<T extends Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

function presentExistingStage(root: HTMLElement, stageId: keyof typeof STAGE_PRESENTATION): void {
  const stage = query<HTMLDetailsElement>(root, `#${stageId}`);
  if (!stage) return;
  const [label, description, state] = STAGE_PRESENTATION[stageId];
  const copy = query<HTMLElement>(stage, ".skin-author-stage-copy");
  const stateLabel = query<HTMLElement>(stage, ".skin-author-stage-state");
  const strong = copy?.querySelector("strong");
  const small = copy?.querySelector("small");
  if (strong) strong.textContent = label;
  if (small) small.textContent = description;
  if (stateLabel) stateLabel.textContent = state;
}

function presentProjectHeader(app: HTMLElement, version: string, updatedAt: string): void {
  const eyebrow = query<HTMLElement>(app, ".skin-project-eyebrow");
  const name = query<HTMLElement>(app, ".skin-project-name");
  const format = query<HTMLElement>(app, ".skin-project-format");
  const meta = query<HTMLElement>(app, ".skin-project-meta");
  if (eyebrow) eyebrow.textContent = "KATACHI";
  if (name) name.textContent = "SKIN";
  if (format) format.textContent = "ARTWORK STUDIO / v0";
  if (meta) meta.textContent = "Ready · Shape and workflow history connected";

  const labels: readonly [string, string][] = [
    ["#skin-project-open", "Open"],
    ["#skin-project-save", "Save"],
    ["#skin-project-stage-2-sample", "Stage 2"],
    ["#skin-project-complete-sample", "Complete"],
    ["#skin-project-undo", "Undo"],
    ["#skin-project-redo", "Redo"],
  ];
  for (const [selector, label] of labels) {
    const button = query<HTMLButtonElement>(app, selector);
    if (button) button.textContent = label;
  }

  const projectExport = query<HTMLButtonElement>(app, "#skin-project-export");
  if (projectExport) projectExport.hidden = true;

  const actions = query<HTMLElement>(app, ".skin-project-actions");
  const stage2Sample = query<HTMLButtonElement>(app, "#skin-project-stage-2-sample");
  const completeSample = query<HTMLButtonElement>(app, "#skin-project-complete-sample");
  if (actions && stage2Sample && completeSample) {
    const samples = document.createElement("details");
    samples.className = "skin-art-project-samples";
    const summary = document.createElement("summary");
    summary.textContent = "Samples";
    summary.setAttribute("aria-label", "Open sample project menu");
    const sampleActions = document.createElement("div");
    sampleActions.className = "skin-art-project-sample-actions";
    sampleActions.append(stage2Sample, completeSample);
    samples.append(summary, sampleActions);
    actions.appendChild(samples);
  }

  const projectBar = query<HTMLElement>(app, ".skin-project-bar");
  if (projectBar) {
    const build = document.createElement("span");
    build.className = "skin-art-build-signature";
    build.textContent = `v${version} · ${updatedAt}`;
    projectBar.appendChild(build);
  }
}

function presentAdvancedLab(workflowRoot: HTMLElement): void {
  const lab = query<HTMLDetailsElement>(workflowRoot, ".skin-auxiliary-frozen");
  const summary = lab?.querySelector<HTMLElement>(":scope > summary");
  const body = lab ? query<HTMLElement>(lab, ".skin-auxiliary-frozen-body") : null;
  if (!lab || !summary || !body) return;
  lab.open = false;
  lab.dataset.workflowClass = "legacy";
  lab.classList.add("is-production-legacy", "skin-art-lab");
  summary.textContent = "Advanced / Lab";
  summary.setAttribute("aria-label", "Open Advanced and Lab controls");
  const intro = document.createElement("p");
  intro.className = "skin-art-lab-intro";
  intro.textContent = "Research controls, diagnostics and retained experiments. Production actions remain above.";
  body.insertBefore(intro, body.firstChild);
}

export function mountSkinArtUiShell(options: MountSkinArtUiShellOptions): void {
  const { app, workflowRoot, rightPaneBody, viewport, version, updatedAt } = options;
  document.documentElement.classList.add("skin-art-ui");
  document.body.classList.add("skin-art-ui-body");
  app.dataset.presentation = "skin-art-ui-v0";

  presentProjectHeader(app, version, updatedAt);

  const leftHeader = query<HTMLElement>(app, ".skin-left-pane .skin-pane-header");
  const rightHeader = query<HTMLElement>(app, ".skin-right-pane .skin-pane-header");
  if (leftHeader) leftHeader.innerHTML = "<strong>TOOLS</strong><span>View & selection</span>";
  if (rightHeader) rightHeader.innerHTML = "<strong>PHASE</strong><span>Base Shape</span>";
  query<HTMLElement>(app, ".skin-left-pane")?.setAttribute("aria-label", "Tools and view controls");
  query<HTMLButtonElement>(app, ".skin-pane-divider.is-left .skin-pane-collapse")?.setAttribute("aria-label", "Toggle Tools panel");
  query<HTMLButtonElement>(app, ".skin-pane-divider.is-right .skin-pane-collapse")?.setAttribute("aria-label", "Toggle Phase controls");
  query<HTMLButtonElement>(app, ".skin-bottom-pane-collapse")?.setAttribute("aria-label", "Toggle status panel");

  for (const [classification, stageIds] of Object.entries(SKIN_REBUILD_STAGE_CLASSIFICATION)) {
    for (const stageId of stageIds) {
      const stage = query<HTMLElement>(workflowRoot, `#${stageId}`);
      if (!stage) continue;
      stage.dataset.workflowClass = classification;
      stage.classList.add(`is-production-${classification}`);
    }
  }
  for (const stageId of Object.keys(STAGE_PRESENTATION) as (keyof typeof STAGE_PRESENTATION)[]) {
    presentExistingStage(workflowRoot, stageId);
  }
  presentAdvancedLab(workflowRoot);

  for (const selector of [".panel-title", ".version-row", ".ball-count"] as const) {
    query<HTMLElement>(workflowRoot, selector)?.classList.add("skin-art-shell-legacy-heading");
  }

  const viewportCaption = document.createElement("div");
  viewportCaption.className = "skin-art-viewport-caption";
  viewportCaption.setAttribute("aria-hidden", "true");
  viewportCaption.innerHTML = "<span>LIVE FORM</span><strong>ARTWORK VIEW</strong><small>Drag to orbit · Scroll to zoom</small>";
  viewport.appendChild(viewportCaption);
  const emptyViewportHint = query<HTMLElement>(viewport, ".viewport-empty-hint");
  if (emptyViewportHint) emptyViewportHint.textContent = "Base Shape is visible. Choose a Surface Pattern, then generate the surface.";

  const phaseNavigator = document.createElement("nav");
  phaseNavigator.className = "skin-rebuild-phase-navigator skin-art-phase-navigator";
  phaseNavigator.setAttribute("aria-label", "SKIN artwork phases");
  const phaseKicker = document.createElement("div");
  phaseKicker.className = "skin-art-phase-kicker";
  phaseKicker.innerHTML = "<span>PROCESS</span><strong>01 — 04</strong>";
  const phaseList = document.createElement("div");
  phaseList.className = "skin-art-phase-list";
  const context = document.createElement("header");
  context.className = "skin-art-phase-context";
  const contextIndex = document.createElement("span");
  const contextTitle = document.createElement("strong");
  const contextDescription = document.createElement("p");
  context.append(contextIndex, contextTitle, contextDescription);
  const buttons: HTMLButtonElement[] = [];
  let currentPhaseIndex = 0;

  const activatePhase = (index: number, userInitiated: boolean): void => {
    currentPhaseIndex = Math.max(0, Math.min(SKIN_ART_UI_PHASES.length - 1, index));
    const phase = SKIN_ART_UI_PHASES[currentPhaseIndex];
    const activeStageIds = new Set(phase.stageIds);
    app.dataset.artPhase = phase.shortLabel.toLowerCase();
    contextIndex.textContent = `${String(currentPhaseIndex + 1).padStart(2, "0")} / ${String(SKIN_ART_UI_PHASES.length).padStart(2, "0")}`;
    contextTitle.textContent = phase.label;
    contextDescription.textContent = phase.description;
    const rightHeaderDetail = rightHeader?.querySelector("span");
    if (rightHeaderDetail) rightHeaderDetail.textContent = phase.label;

    for (const mappedPhase of SKIN_ART_UI_PHASES) {
      for (const stageId of mappedPhase.stageIds) {
        const stage = query<HTMLDetailsElement>(workflowRoot, `#${stageId}`);
        if (!stage) continue;
        stage.dataset.artPhase = mappedPhase.shortLabel.toLowerCase();
        stage.hidden = !activeStageIds.has(stageId);
      }
    }
    const target = query<HTMLDetailsElement>(workflowRoot, `#${phase.targetId}`);
    if (target) target.open = true;
    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === currentPhaseIndex;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "step" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    if (userInitiated) {
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      buttons[currentPhaseIndex]?.focus({ preventScroll: true });
    }
  };

  SKIN_ART_UI_PHASES.forEach((phase, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skin-art-phase-button";
    button.dataset.phaseIndex = String(index);
    button.setAttribute("aria-label", `${index + 1}. ${phase.label}`);
    const number = document.createElement("span");
    number.className = "skin-art-phase-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "skin-art-phase-copy";
    const label = document.createElement("strong");
    label.textContent = phase.label;
    const short = document.createElement("small");
    short.textContent = phase.shortLabel;
    copy.append(label, short);
    button.append(number, copy);
    button.addEventListener("click", () => activatePhase(index, true));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
      activatePhase(moveSkinRebuildWorkflowPhase(currentPhaseIndex, direction), true);
    });
    buttons.push(button);
    phaseList.appendChild(button);
  });

  phaseNavigator.append(phaseKicker, phaseList);
  rightPaneBody.insertBefore(context, workflowRoot);
  rightPaneBody.insertBefore(phaseNavigator, context);
  activatePhase(0, false);
}
