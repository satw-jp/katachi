import type { SkinEditorViewDraftV1 } from "../multiViewport.ts";
import type { InternalObservationMode } from "../previewMeshBuffers.ts";
import type { SkinViewMode, SkinRenderer } from "../renderer.ts";
import {
  applyResearchDiameterEdit,
  buildResearchPreview,
  createF2CompactFixture,
  createResearchProjectState,
  getResearchMember,
  importResearchSource,
  researchEditEligibility,
  researchMemberKindSummary,
  researchSourceReference,
  researchSourceSummary,
  redoResearchEdit,
  restoreResearchProject,
  serializeResearchProject,
  undoResearchEdit,
  type ResearchProjectState,
} from "./researchProject.ts";

export interface ResearchProjectAuthoringHost {
  actionHost: HTMLElement;
  panelHost: HTMLElement;
  renderer: SkinRenderer;
  openPanel: () => void;
  restoreMainInternalStructure: () => void;
  render: () => void;
}

type SavedResearchView = {
  draft: SkinEditorViewDraftV1;
  viewMode: SkinViewMode;
  observationMode: InternalObservationMode;
};

function button(label: string, className = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  if (className) element.className = className;
  return element;
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(3)} mm`;
}

export function installResearchProjectAuthoring(host: ResearchProjectAuthoringHost): void {
  const launchButton = button("Research v0");
  launchButton.className = "skin-project-action skin-research-launch";
  launchButton.title = "F2 source-derived bounded authoring research project";
  host.actionHost.appendChild(launchButton);

  const panel = document.createElement("section");
  panel.className = "skin-research-authoring-panel";
  panel.setAttribute("aria-label", "SKIN Authoring Research project v0");
  panel.hidden = true;

  const heading = document.createElement("header");
  heading.className = "skin-research-authoring-heading";
  const title = document.createElement("strong");
  title.textContent = "SKIN Authoring v0 · Research project";
  const closeButton = button("Close");
  closeButton.className = "skin-research-close";
  heading.append(title, closeButton);

  const note = document.createElement("p");
  note.className = "skin-research-note";
  note.textContent = "F2 structure.jsonのsource-derived preview。編集対象はuniform SHARED_COREの単一memberだけです。mesh / Support / fabrication / exportは再生成しません。";

  const sourceActions = document.createElement("div");
  sourceActions.className = "skin-research-source-actions";
  const fixtureButton = button("F2 compact fixture");
  const sourceOpenButton = button("F2 structure.json Open");
  const sourceInput = document.createElement("input");
  sourceInput.type = "file";
  sourceInput.accept = "application/json,.json";
  sourceInput.hidden = true;
  const projectOpenButton = button(".skinproj Open");
  const projectInput = document.createElement("input");
  projectInput.type = "file";
  projectInput.accept = ".skinproj,application/json";
  projectInput.hidden = true;
  const projectSaveButton = button(".skinproj Save");
  const reopenButton = button("Reopen last save");
  reopenButton.disabled = true;
  sourceActions.append(fixtureButton, sourceOpenButton, sourceInput, projectOpenButton, projectInput, projectSaveButton, reopenButton);

  const sourceStatus = document.createElement("div");
  sourceStatus.className = "skin-research-source-status";
  sourceStatus.setAttribute("aria-live", "polite");
  sourceStatus.textContent = "No research source loaded";
  const sourceLink = document.createElement("a");
  sourceLink.href = researchSourceReference();
  sourceLink.target = "_blank";
  sourceLink.rel = "noreferrer";
  sourceLink.textContent = "F2 source reference";

  const memberControls = document.createElement("div");
  memberControls.className = "skin-research-member-controls";
  const memberLabel = document.createElement("label");
  memberLabel.textContent = "member id";
  const memberInput = document.createElement("input");
  memberInput.type = "text";
  memberInput.value = "C0002";
  memberInput.spellcheck = false;
  memberInput.className = "skin-research-member-id";
  memberLabel.appendChild(memberInput);
  const selectButton = button("Select");
  const diameterLabel = document.createElement("label");
  diameterLabel.textContent = "diameter";
  const diameterInput = document.createElement("input");
  diameterInput.type = "number";
  diameterInput.min = "0.1";
  diameterInput.max = "20";
  diameterInput.step = "0.1";
  diameterInput.value = "3";
  diameterLabel.append(diameterInput, document.createTextNode(" mm"));
  const applyButton = button("Apply diameter");
  const undoButton = button("Undo");
  const redoButton = button("Redo");
  memberControls.append(memberLabel, selectButton, diameterLabel, applyButton, undoButton, redoButton);

  const memberStatus = document.createElement("div");
  memberStatus.className = "skin-research-member-status";
  memberStatus.setAttribute("aria-live", "polite");
  const derivedStatus = document.createElement("div");
  derivedStatus.className = "skin-research-derived-status";
  derivedStatus.textContent = "Derived preview: not loaded";
  const limitation = document.createElement("p");
  limitation.className = "skin-research-limitation";
  limitation.textContent = "Preview uses source member endpoints and radius; it is not a source-NPZ surface, fused BODY, collision, slicer, or printability proof.";

  panel.append(heading, note, sourceActions, sourceStatus, sourceLink, memberControls, memberStatus, derivedStatus, limitation);
  host.panelHost.appendChild(panel);

  let active = false;
  let state: ResearchProjectState | null = null;
  let lastSavedText: string | null = null;
  let savedView: SavedResearchView | null = null;

  const currentMember = () => getResearchMember(state!, memberInput.value.trim());

  const refreshMemberControls = (): void => {
    const member = state ? currentMember() : undefined;
    const sourceMember = state?.source.members.find((candidate) => candidate.id === memberInput.value.trim());
    memberStatus.textContent = state
      ? `${researchMemberKindSummary(member)} · source ${numberText(sourceMember?.diameterMm)} → current ${numberText(member?.diameterMm)}`
      : "Load F2 source or compact fixture, then select a member";
    if (member) {
      diameterInput.value = String(member.diameterMm);
      const eligibility = researchEditEligibility(member);
      applyButton.disabled = !eligibility.eligible;
      memberStatus.dataset.eligible = String(eligibility.eligible);
    } else {
      applyButton.disabled = true;
      delete memberStatus.dataset.eligible;
    }
    undoButton.disabled = !state || state.historyCursor === 0;
    redoButton.disabled = !state || state.historyCursor === state.history.length;
  };

  const installPreview = (frame: boolean): void => {
    if (!state) return;
    const preview = buildResearchPreview(state);
    host.renderer.setInternalStructure(preview.graph);
    host.renderer.setInternalObservationMode("internalOnly");
    host.renderer.setViewMode("beads");
    const edgeId = preview.edgeIdByMemberId.get(memberInput.value.trim());
    host.renderer.setSelectedInternalStructureEdge(preview.graph, edgeId ?? null);
    if (frame) host.renderer.setViewportBoundsFromPositions(preview.positions);
    sourceStatus.textContent = `${researchSourceSummary(state.source)} · SHA-256 ${state.source.identity.sha256}`;
    derivedStatus.textContent = `Derived Research preview · ${preview.graph.edges.length.toLocaleString()} member edges · current diameter edits ${state.historyCursor}/${state.history.length} · support/fabrication/export not generated`;
    refreshMemberControls();
    host.render();
  };

  const loadState = (nextState: ResearchProjectState, label: string): void => {
    state = nextState;
    sourceStatus.textContent = `${label} · ${researchSourceSummary(state.source)}`;
    installPreview(true);
  };

  const showError = (label: string, error: unknown): void => {
    sourceStatus.textContent = `${label}: ${error instanceof Error ? error.message : String(error)}`;
    sourceStatus.dataset.error = "true";
  };

  const openAuthoring = (): void => {
    if (active) return;
    host.openPanel();
    savedView = {
      draft: host.renderer.captureEditorViewDraft(),
      viewMode: host.renderer.getViewMode(),
      observationMode: host.renderer.getInternalObservationMode(),
    };
    active = true;
    panel.hidden = false;
    launchButton.dataset.active = "true";
    launchButton.textContent = "Research v0 · Open";
    refreshMemberControls();
  };

  const closeAuthoring = (): void => {
    if (!active) return;
    active = false;
    panel.hidden = true;
    launchButton.dataset.active = "false";
    launchButton.textContent = "Research v0";
    host.renderer.setSelectedInternalStructureEdge(null, null);
    host.renderer.setInternalStructure(null);
    host.restoreMainInternalStructure();
    if (savedView) {
      host.renderer.setInternalObservationMode(savedView.observationMode);
      host.renderer.setViewMode(savedView.viewMode);
      host.renderer.restoreEditorViewDraft(savedView.draft);
    }
    host.render();
  };

  launchButton.onclick = openAuthoring;
  closeButton.onclick = closeAuthoring;
  fixtureButton.onclick = () => {
    try {
      loadState(createResearchProjectState(createF2CompactFixture()), "F2 compact fixture loaded");
      sourceStatus.removeAttribute("data-error");
    } catch (error) {
      showError("Fixture load failed", error);
    }
  };
  sourceOpenButton.onclick = () => sourceInput.click();
  sourceInput.onchange = async () => {
    const file = sourceInput.files?.[0];
    sourceInput.value = "";
    if (!file) return;
    try {
      loadState(createResearchProjectState(await importResearchSource(file)), "F2 full source loaded");
      sourceStatus.removeAttribute("data-error");
    } catch (error) {
      showError("F2 source load failed", error);
    }
  };
  projectOpenButton.onclick = () => projectInput.click();
  projectInput.onchange = async () => {
    const file = projectInput.files?.[0];
    projectInput.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      loadState(await restoreResearchProject(text), "Research project reopened");
      sourceStatus.removeAttribute("data-error");
    } catch (error) {
      showError("Research project restore rejected", error);
    }
  };
  projectSaveButton.onclick = () => {
    if (!state) {
      sourceStatus.textContent = "Load a source before saving a .skinproj";
      return;
    }
    try {
      lastSavedText = serializeResearchProject(state);
      downloadText(lastSavedText, "skin-authoring-research-project-v0.skinproj");
      reopenButton.disabled = false;
      sourceStatus.textContent = "Saved .skinproj · embedded source identity / explicit edit deltas preserved";
    } catch (error) {
      showError("Research project save failed", error);
    }
  };
  reopenButton.onclick = async () => {
    if (!lastSavedText) return;
    try {
      state = null;
      host.renderer.setSelectedInternalStructureEdge(null, null);
      host.renderer.setInternalStructure(null);
      const reopened = await restoreResearchProject(lastSavedText);
      loadState(reopened, "Fresh restore of last saved .skinproj");
    } catch (error) {
      showError("Fresh restore rejected", error);
    }
  };
  selectButton.onclick = () => {
    if (!state) return;
    installPreview(false);
  };
  memberInput.onchange = () => refreshMemberControls();
  applyButton.onclick = () => {
    if (!state) return;
    try {
      state = applyResearchDiameterEdit(state, memberInput.value.trim(), Number(diameterInput.value));
      installPreview(false);
    } catch (error) {
      showError("Diameter edit rejected", error);
    }
  };
  undoButton.onclick = () => {
    if (!state) return;
    state = undoResearchEdit(state);
    installPreview(false);
  };
  redoButton.onclick = () => {
    if (!state) return;
    state = redoResearchEdit(state);
    installPreview(false);
  };
}
