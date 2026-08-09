import { createSlider, type SliderHandle } from "../../lib/ui/slider.ts";
import { createVersionRow } from "../../lib/ui/version.ts";
import {
  DEFAULT_FLOWER_FORM_PARAMS,
  DEFAULT_FLOWER_FORM_VARIANT,
  FLOWER_FORM_VARIANTS,
  paramsForFlowerVariant,
  type FlowerFormParams,
  type FlowerFormVariantId,
} from "./flowerForm.ts";

export interface FlowerFormUiState {
  petalCount: 3 | 4;
  params: FlowerFormParams;
  selectedVariant: FlowerFormVariantId;
  showSources: boolean;
}

export interface FlowerFormUiCallbacks {
  onStateChange: (state: FlowerFormUiState) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function viewCard(id: string, eyebrow: string, title: string, note: string): HTMLElement {
  const card = el("section", "form-view-card");
  const host = el("div", "form-render-host");
  host.id = id;
  const label = el("div", "form-view-label");
  label.append(
    el("div", "form-view-eyebrow", eyebrow),
    el("h2", "form-view-title", title),
    el("p", "form-view-note", note),
  );
  card.append(host, label);
  return card;
}

function atlasCard(variant: (typeof FLOWER_FORM_VARIANTS)[number]): HTMLButtonElement {
  const card = el("button", "atlas-card") as HTMLButtonElement;
  card.type = "button";
  card.dataset.variant = variant.id;
  card.setAttribute("aria-label", `${variant.label}: ${variant.cause}`);
  const host = el("div", "atlas-render-host");
  host.id = `flower-atlas-${variant.id}`;
  const copy = el("div", "atlas-card-copy");
  copy.append(
    el("span", "atlas-card-kicker", variant.shortLabel),
    el("strong", "atlas-card-title", variant.label),
    el("span", "atlas-card-cause", variant.cause),
  );
  card.append(host, copy);
  return card;
}

export function buildFlowerFormUi(
  app: HTMLElement,
  version: string,
  updatedAt: string,
  callbacks: FlowerFormUiCallbacks,
): FlowerFormUiState {
  const shell = el("div", "study-shell flower-form-shell");
  const viewport = el("main", "viewport-shell flower-atlas-viewport");
  viewport.id = "viewport";

  const views = el("div", "form-view-grid");
  views.append(
    viewCard("flower-view-front", "FRONT", "正面", "輪郭と花弁の開き"),
    viewCard("flower-view-side", "SIDE", "横", "厚み・反り・中心の高さ"),
    viewCard("flower-view-oblique", "OBLIQUE", "斜め", "正面と横のつながり"),
  );
  const atlasSection = el("section", "atlas-section");
  const atlasHeading = el("div", "atlas-heading");
  atlasHeading.append(
    el("span", "atlas-heading-kicker", "FORM ATLAS / NO WINNER"),
    el("span", "atlas-heading-copy", "形が変わる理由を選ぶ。どれも候補として残す。"),
  );
  const atlasGrid = el("div", "atlas-grid");
  const atlasButtons = FLOWER_FORM_VARIANTS.map((variant) => atlasCard(variant));
  atlasGrid.append(...atlasButtons);
  atlasSection.append(atlasHeading, atlasGrid);
  viewport.append(views, atlasSection);

  const panel = el("aside", "panel");
  panel.append(
    el("div", "panel-kicker", "FLOWER FORM / ATLAS"),
    el("h1", "panel-title", "一つの花を三方向から見る"),
    createVersionRow(version, updatedAt),
  );

  const nav = el("nav", "nav-row");
  for (const [href, label] of [
    ["./flower-packing-spike.html", "Packingへ戻る"],
    ["./studies.html", "Studies"],
  ]) {
    const link = el("a", "nav-link", label);
    link.href = href;
    nav.appendChild(link);
  }
  panel.appendChild(nav);
  panel.appendChild(
    el(
      "p",
      "question-copy",
      "正解を一つに決めず、同じ花を正面・横・斜めから見る。自然らしさは、反り・中心の成長・花弁ごとの成長差として一つずつ加える。",
    ),
  );

  let state: FlowerFormUiState = {
    petalCount: 4,
    params: { ...DEFAULT_FLOWER_FORM_PARAMS },
    selectedVariant: DEFAULT_FLOWER_FORM_VARIANT,
    showSources: false,
  };
  const emit = (): void => callbacks.onStateChange({ ...state, params: { ...state.params } });

  panel.appendChild(el("div", "section-title", "花弁の数 — 勝ち負けではない"));
  const countRow = el("div", "segmented petal-count-segmented");
  const countButtons = ([3, 4] as const).map((count) => {
    const button = el("button", "segment-button", `${count}枚`) as HTMLButtonElement;
    button.type = "button";
    button.onclick = () => {
      state = { ...state, petalCount: count };
      updateUiState();
      status.textContent = `${count}枚の花を三方向から観察中。アトラスの形はどれも残ります。`;
      emit();
    };
    countRow.appendChild(button);
    return button;
  });
  panel.appendChild(countRow);

  const handles = new Map<keyof FlowerFormParams, SliderHandle>();
  const addSlider = (
    key: keyof FlowerFormParams,
    label: string,
    min: number,
    max: number,
    step: number,
  ): void => {
    const handle = createSlider({
      label,
      min,
      max,
      step,
      initial: state.params[key],
      format: (value) => value.toFixed(2),
      onChange: (value) => {
        state = { ...state, params: { ...state.params, [key]: value } };
        status.textContent = "正面だけでなく、横の厚みと斜めのつながりも同時に変化しています。";
        emit();
      },
    });
    handles.set(key, handle);
    panel.appendChild(handle.row);
  };

  panel.appendChild(el("div", "section-title", "輪郭の土台"));
  addSlider("opening", "花弁の開き", 0.72, 1.22, 0.01);
  addSlider("neck", "付け根の太さ", 0.14, 0.62, 0.01);
  addSlider("coreSize", "花芯の大きさ", 0.42, 0.78, 0.01);

  panel.appendChild(el("div", "section-title", "自然形状をつくる理由"));
  addSlider("cupping", "花弁の反り", -0.18, 0.5, 0.01);
  addSlider("coreLift", "花芯の高さ", -0.12, 0.5, 0.01);
  addSlider("growthDifference", "花弁の成長差", 0, 0.34, 0.01);

  const sourceRow = el("label", "check-row");
  const sourceCheck = document.createElement("input");
  sourceCheck.type = "checkbox";
  sourceCheck.onchange = () => {
    state = { ...state, showSources: sourceCheck.checked };
    emit();
  };
  sourceRow.append(sourceCheck, document.createTextNode(" もとの球を重ねる"));
  panel.appendChild(sourceRow);

  const reset = el("button", "primary-action", "最初のアトラスに戻す");
  reset.onclick = () => {
    state = {
      petalCount: 4,
      params: { ...DEFAULT_FLOWER_FORM_PARAMS },
      selectedVariant: DEFAULT_FLOWER_FORM_VARIANT,
      showSources: false,
    };
    sourceCheck.checked = false;
    for (const [key, handle] of handles) handle.set(state.params[key]);
    updateUiState();
    status.textContent = "花弁が起きる形を、正面・横・斜めに戻しました。";
    emit();
  };
  panel.appendChild(reset);
  panel.appendChild(
    el(
      "p",
      "hint",
      "下の四つは完成候補ではなく、変化の入口。形を押すと三つの窓が同じ花へ切り替わります。",
    ),
  );

  const status = el("div", "status-line", "花弁が起きる形を、正面・横・斜めから同時に観察中。");
  panel.appendChild(status);

  for (const [index, variant] of FLOWER_FORM_VARIANTS.entries()) {
    atlasButtons[index].onclick = () => {
      state = {
        ...state,
        selectedVariant: variant.id,
        params: paramsForFlowerVariant(variant.id, state.params),
      };
      handles.get("cupping")?.set(state.params.cupping);
      handles.get("coreLift")?.set(state.params.coreLift);
      handles.get("growthDifference")?.set(state.params.growthDifference);
      updateUiState();
      status.textContent = `${variant.label} — ${variant.cause}。横窓で厚みを確認できます。`;
      emit();
    };
  }

  function updateUiState(): void {
    for (const [index, count] of ([3, 4] as const).entries()) {
      const active = state.petalCount === count;
      countButtons[index].classList.toggle("active", active);
      countButtons[index].setAttribute("aria-pressed", String(active));
    }
    for (const button of atlasButtons) {
      const active = button.dataset.variant === state.selectedVariant;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  updateUiState();
  shell.append(viewport, panel);
  app.appendChild(shell);
  return state;
}
