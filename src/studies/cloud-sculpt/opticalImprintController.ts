import type { CausticField } from "./optics.ts";
import {
  deriveOpticalImprint,
  normalizeOpticalDissolveSettings,
  OPTICAL_DISSOLVE_PRESETS,
  type OpticalDissolvePresetId,
  type OpticalDissolveSettings,
  type OpticalImprintTextureData,
} from "./opticalImprint.ts";
import {
  DEFAULT_OPTICAL_FORM_MOTION,
  type OpticalFormMotionMode,
  type OpticalFormMotionSettings,
} from "./formObservation/opticalMotion.ts";
import { getHikariPublishedStudyPreset } from "./opticalStudyPreset.ts";

export interface OpticalImprintRenderer {
  setOpticalImprintData(data: OpticalImprintTextureData): void;
  setOpticalImprintEnabled(enabled: boolean): void;
  setOpticalImprintPresentation(options: {
    opacity: number;
    separation: number;
    causticBoost: number;
    fullFrame: boolean;
    placement: "background" | "integrated" | "foreground";
    scale: number;
    offsetX: number;
    offsetY: number;
    dissolve?: {
      preset: OpticalDissolvePresetId;
      settings: OpticalDissolveSettings;
    };
  }): void;
  captureOpticalImprintView(): void;
  clearOpticalImprint(): void;
  setOpticalFormBodyEnabled(enabled: boolean): void;
  setOpticalFormMotion(settings: OpticalFormMotionSettings): void;
  setOpticalFormBlackBackground(enabled: boolean): void;
}

export class OpticalImprintController {
  private readonly renderer: OpticalImprintRenderer;
  private readonly group: HTMLDetailsElement;
  private readonly status: HTMLDivElement;
  private readonly formBodyStatus: HTMLDivElement;
  private enabled = true;

  constructor(host: HTMLElement, renderer: OpticalImprintRenderer) {
    this.renderer = renderer;
    const hikariControls = host.querySelector<HTMLElement>(".hikari-controls");
    if (!hikariControls) throw new Error("Optical Imprint requires the Hikari property panel");

    this.group = document.createElement("details");
    this.group.className = "property-group optical-imprint-controls";
    this.group.open = true;
    const summary = document.createElement("summary");
    summary.textContent = "Hikari Optical Imprint";
    const body = document.createElement("div");
    body.className = "property-group-body";

    const title = document.createElement("div");
    title.className = "hikari-section-title";
    title.textContent = "OPTICAL IMPRINT · DISSOLVE DRAWING";
    const note = document.createElement("div");
    note.className = "hint";
    note.textContent =
      "Deterministic display mask; changes neither shape/material nor transport; caustics do not physically erode the body. 記録角度から外れるとBODYは完全に戻ります。";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "toggle-row";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = true;
    const toggleText = document.createElement("span");
    toggleText.textContent = "背景へ表示";
    toggleLabel.append(toggle, toggleText);

    const fullFrameLabel = document.createElement("label");
    fullFrameLabel.className = "toggle-row";
    const fullFrame = document.createElement("input");
    fullFrame.type = "checkbox";
    fullFrame.checked = true;
    fullFrame.setAttribute("aria-label", "画面いっぱいに広げる");
    const fullFrameText = document.createElement("span");
    fullFrameText.textContent = "画面いっぱいに広げる";
    fullFrameLabel.append(fullFrame, fullFrameText);

    const placementLabel = document.createElement("label");
    placementLabel.className = "optical-imprint-select-row";
    const placementText = document.createElement("span");
    placementText.textContent = "配置";
    const placement = document.createElement("select");
    placement.setAttribute("aria-label", "エフェクトの配置");
    for (const [value, label] of [
      ["background", "背景のみ"],
      ["integrated", "形と背景を一体化"],
      ["foreground", "前景として重ねる"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      placement.appendChild(option);
    }
    placement.value = "integrated";
    placementLabel.append(placementText, placement);

    const bodySourceLabel = document.createElement("label");
    bodySourceLabel.className = "optical-imprint-select-row";
    const bodySourceText = document.createElement("span");
    bodySourceText.textContent = "本体の描画";
    const bodySource = document.createElement("select");
    bodySource.setAttribute("aria-label", "本体の描画方式");
    for (const [value, label] of [
      ["form", "FORM 点描（回転可能）"],
      ["optics", "OPTICS 透明体"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      bodySource.appendChild(option);
    }
    bodySource.value = "form";
    bodySourceLabel.append(bodySourceText, bodySource);

    this.formBodyStatus = document.createElement("div");
    this.formBodyStatus.className = "hint optical-form-body-status";
    this.formBodyStatus.textContent = "FORM点描を準備しています";

    const formMotionBlock = document.createElement("div");
    formMotionBlock.className = "optical-form-motion-controls";
    const formMotionTitle = document.createElement("div");
    formMotionTitle.className = "hikari-section-title";
    formMotionTitle.textContent = "FORM POINTS + OPTICAL TRAILS";
    const formMotionNote = document.createElement("div");
    formMotionNote.className = "hint";
    formMotionNote.textContent =
      "形全体の波を基礎に、再配分方向・コースティクス・影・届いたRGB光を、点の移動と線の長さへ重ねます。";
    const motionModeLabel = document.createElement("label");
    motionModeLabel.className = "optical-imprint-select-row";
    const motionModeText = document.createElement("span");
    motionModeText.textContent = "線の動き";
    const motionMode = document.createElement("select");
    motionMode.setAttribute("aria-label", "FORMの線の動き");
    for (const [value, label] of [
      ["stream", "流走 STREAM"],
      ["pulse", "伸縮 PULSE"],
      ["orbit", "包絡 ORBIT（3D）"],
      ["flowTrails", "FLOW TRAILS（原型）"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      motionMode.appendChild(option);
    }
    motionMode.value = DEFAULT_OPTICAL_FORM_MOTION.mode;
    motionModeLabel.append(motionModeText, motionMode);
    const blackBackgroundLabel = document.createElement("label");
    blackBackgroundLabel.className = "toggle-row";
    const blackBackground = document.createElement("input");
    blackBackground.type = "checkbox";
    blackBackground.setAttribute("aria-label", "FORMの背景を黒にする");
    const blackBackgroundText = document.createElement("span");
    blackBackgroundText.textContent = "背景を黒にする";
    blackBackgroundLabel.append(blackBackground, blackBackgroundText);
    const trailLength = makeRange("線の長さ", 0.01, 1.8, 0.01, DEFAULT_OPTICAL_FORM_MOTION.trailLength);
    const motionSpeed = makeRange("動きの速さ", 0.1, 20, 0.1, DEFAULT_OPTICAL_FORM_MOTION.speed);
    const pointMotion = makeRange("点の移動", 0, 0.8, 0.005, DEFAULT_OPTICAL_FORM_MOTION.pointMotion);
    const opticalMapping = makeRange("光学→動き", 0, 20, 0.1, DEFAULT_OPTICAL_FORM_MOTION.opticalMapping);
    const trailDensity = makeRange("軌跡密度", 0.25, 4, 0.25, DEFAULT_OPTICAL_FORM_MOTION.trailDensity);
    const motionControls = [trailLength, motionSpeed, pointMotion, opticalMapping, trailDensity];
    formMotionBlock.append(
      formMotionTitle,
      formMotionNote,
      motionModeLabel,
      blackBackgroundLabel,
      trailLength.root,
      motionSpeed.root,
      pointMotion.root,
      opticalMapping.root,
      trailDensity.root,
    );

    const capture = document.createElement("button");
    capture.type = "button";
    capture.textContent = "この角度を記録";
    capture.dataset.opticalImprintAction = "capture";

    const presentationTitle = document.createElement("div");
    presentationTitle.className = "hikari-section-title";
    presentationTitle.textContent = "背景・投影";
    // Established v0.32.5 presentation controls remain independent from the
    // BODY display mask and are forwarded unchanged on every live sync.
    const causticBoost = makeRange("コースティクス誇張", 0, 8, 0.1, 3.2);
    const scale = makeRange("投影の大きさ", 0.5, 2.5, 0.05, 1.15);
    const offsetX = makeRange("左右の位置", -0.5, 0.5, 0.01, 0);
    const offsetY = makeRange("上下の位置", -0.5, 0.5, 0.01, 0);
    const separation = makeRange("層のずれ", 0, 2, 0.05, 1);
    const opacity = makeRange("濃さ", 0, 1, 0.05, 0.82);

    const dissolveTitle = document.createElement("div");
    dissolveTitle.className = "hikari-section-title";
    dissolveTitle.textContent = "OPTICS BODY dissolve drawing";

    const presetLabel = document.createElement("label");
    presetLabel.className = "optical-imprint-select-row";
    const presetText = document.createElement("span");
    presetText.textContent = "OPTICS BODY 表示";
    const preset = document.createElement("select");
    preset.setAttribute("aria-label", "BODY dissolve drawing preset");
    for (const [value, label] of [
      ["solid", "SOLID"],
      ["half", "HALF (default)"],
      ["drawing", "DRAWING"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      preset.appendChild(option);
    }
    preset.value = "half";
    const presetState = document.createElement("div");
    presetState.className = "hint optical-imprint-preset-state";
    presetState.textContent = "HALF";
    presetLabel.append(presetText, preset);

    // These are the only authorable Optical Dissolve Drawing controls.
    const retention = makeRange("retention", 0.15, 0.9, 0.01, OPTICAL_DISSOLVE_PRESETS.half.retention);
    const strokeHalfWidth = makeRange("stroke half-width (receiver texels)", 0.75, 2.5, 0.01, OPTICAL_DISSOLVE_PRESETS.half.strokeHalfWidth);
    const causticErosion = makeRange("caustic erosion", 0, 1, 0.01, OPTICAL_DISSOLVE_PRESETS.half.causticErosion);
    const trailReach = makeRange("optical trail reach (receiver texels)", 0, 12, 1, OPTICAL_DISSOLVE_PRESETS.half.trailReach);
    const dissolveControls = [retention, strokeHalfWidth, causticErosion, trailReach];
    const dissolveBlock = document.createElement("div");
    dissolveBlock.className = "optical-dissolve-control-block";
    dissolveBlock.append(
      dissolveTitle,
      presetLabel,
      presetState,
      retention.root,
      strokeHalfWidth.root,
      causticErosion.root,
      trailReach.root,
    );
    this.status = document.createElement("div");
    this.status.className = "hint optical-imprint-status";
    this.status.dataset.kind = "waiting";
    this.status.textContent = "受光面の計算を待っています";

    const currentSettings = (): OpticalDissolveSettings => normalizeOpticalDissolveSettings({
      retention: Number(retention.input.value),
      strokeHalfWidth: Number(strokeHalfWidth.input.value),
      causticErosion: Number(causticErosion.input.value),
      trailReach: Number(trailReach.input.value),
    });
    const syncPresentation = (): void => {
      renderer.setOpticalImprintPresentation({
        separation: Number(separation.input.value),
        opacity: Number(opacity.input.value),
        causticBoost: Number(causticBoost.input.value),
        fullFrame: fullFrame.checked,
        placement: placement.value as "background" | "integrated" | "foreground",
        scale: Number(scale.input.value),
        offsetX: Number(offsetX.input.value),
        offsetY: Number(offsetY.input.value),
        dissolve: {
          // CUSTOM retains the drawing path with its manually authored values.
          preset: preset.value === "solid" ? "solid" : "half",
          settings: currentSettings(),
        },
      });
    };
    const syncFormMotion = (): void => {
      renderer.setOpticalFormMotion({
        mode: motionMode.value as OpticalFormMotionMode,
        trailLength: Number(trailLength.input.value),
        speed: Number(motionSpeed.input.value),
        pointMotion: Number(pointMotion.input.value),
        opticalMapping: Number(opticalMapping.input.value),
        trailDensity: Number(trailDensity.input.value),
      });
    };
    const setDisplayedSettings = (settings: OpticalDissolveSettings, id: OpticalDissolvePresetId): void => {
      // SOLID intentionally displays its frozen bypass constants although its
      // author sliders stay in-range and are never used for threshold math.
      retention.input.value = String(Math.min(0.9, settings.retention));
      strokeHalfWidth.input.value = String(Math.max(0.75, settings.strokeHalfWidth));
      causticErosion.input.value = String(settings.causticErosion);
      trailReach.input.value = String(settings.trailReach);
      retention.output.textContent = id === "solid" ? "1.00" : settings.retention.toFixed(2);
      strokeHalfWidth.output.textContent = id === "solid" ? "0" : settings.strokeHalfWidth.toFixed(2);
      causticErosion.output.textContent = id === "solid" ? "0" : settings.causticErosion.toFixed(2);
      trailReach.output.textContent = id === "solid" ? "0" : settings.trailReach.toFixed(0);
    };
    toggle.onchange = () => {
      this.enabled = toggle.checked;
      renderer.setOpticalImprintEnabled(this.enabled);
      this.status.dataset.enabled = String(this.enabled);
    };
    capture.onclick = () => {
      renderer.captureOpticalImprintView();
      this.status.dataset.kind = "ready";
      this.status.textContent = "この角度を基準として記録しました";
    };
    fullFrame.onchange = syncPresentation;
    placement.onchange = syncPresentation;
    const syncBodySource = (): void => {
      const usesForm = bodySource.value === "form";
      renderer.setOpticalFormBodyEnabled(usesForm);
      renderer.setOpticalFormBlackBackground(usesForm && blackBackground.checked);
      dissolveBlock.hidden = usesForm;
      formMotionBlock.hidden = !usesForm;
      this.formBodyStatus.hidden = !usesForm;
      document.documentElement.dataset.hikariOpticalBody = usesForm ? "form" : "optics";
    };
    bodySource.onchange = syncBodySource;
    motionMode.onchange = syncFormMotion;
    blackBackground.onchange = () => {
      renderer.setOpticalFormBlackBackground(
        bodySource.value === "form" && blackBackground.checked,
      );
    };
    for (const control of motionControls) {
      control.input.oninput = () => {
        control.output.textContent = Number(control.input.value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
        syncFormMotion();
      };
    }
    causticBoost.input.oninput = () => {
      causticBoost.output.textContent = Number(causticBoost.input.value).toFixed(1);
      syncPresentation();
    };
    for (const control of [scale, offsetX, offsetY, separation, opacity]) {
      control.input.oninput = () => {
        control.output.textContent = Number(control.input.value).toFixed(2);
        syncPresentation();
      };
    }
    preset.onchange = () => {
      const id = preset.value as OpticalDissolvePresetId;
      setDisplayedSettings(OPTICAL_DISSOLVE_PRESETS[id], id);
      presetState.textContent = id.toUpperCase();
      syncPresentation();
    };
    for (const control of dissolveControls) {
      control.input.oninput = () => {
        control.output.textContent = control === trailReach
          ? Number(control.input.value).toFixed(0)
          : Number(control.input.value).toFixed(2);
        preset.value = "";
        presetState.textContent = "CUSTOM";
        syncPresentation();
      };
    }

    const publishedStudyPreset = getHikariPublishedStudyPreset(document.documentElement.dataset.hikariStudy);
    if (publishedStudyPreset) {
      bodySource.value = publishedStudyPreset.bodySource;
      placement.value = publishedStudyPreset.placement;
      motionMode.value = publishedStudyPreset.motionMode;
      blackBackground.checked = publishedStudyPreset.blackBackground;
      setRangeValue(trailLength, publishedStudyPreset.trailLength, 2);
      setRangeValue(motionSpeed, publishedStudyPreset.speed, 2);
      setRangeValue(pointMotion, publishedStudyPreset.pointMotion, 3);
      setRangeValue(opticalMapping, publishedStudyPreset.opticalMapping, 2);
      setRangeValue(trailDensity, publishedStudyPreset.trailDensity, 2);
      setRangeValue(causticBoost, publishedStudyPreset.causticBoost, 1);
      preset.value = publishedStudyPreset.dissolvePreset;
      presetState.textContent = publishedStudyPreset.dissolvePreset.toUpperCase();
      setDisplayedSettings(
        OPTICAL_DISSOLVE_PRESETS[publishedStudyPreset.dissolvePreset],
        publishedStudyPreset.dissolvePreset,
      );
    }

    body.append(
      title,
      note,
      toggleLabel,
      fullFrameLabel,
      placementLabel,
      bodySourceLabel,
      this.formBodyStatus,
      formMotionBlock,
      capture,
      presentationTitle,
      causticBoost.root,
      scale.root,
      offsetX.root,
      offsetY.root,
      separation.root,
      opacity.root,
      dissolveBlock,
      this.status,
    );
    this.group.append(summary, body);
    const opticsControls = hikariControls.querySelector<HTMLElement>(".hikari-mode-controls:not([hidden])")
      ?? hikariControls.querySelector<HTMLElement>(".hikari-mode-controls");
    (opticsControls ?? hikariControls).appendChild(this.group);
    renderer.setOpticalImprintEnabled(true);
    if (!publishedStudyPreset) setDisplayedSettings(OPTICAL_DISSOLVE_PRESETS.half, "half");
    syncPresentation();
    syncFormMotion();
    syncBodySource();
  }

  setFormBodyStatus(text: string): void {
    this.formBodyStatus.textContent = text;
  }

  updateField(field: CausticField): void {
    const data = deriveOpticalImprint(field);
    this.renderer.setOpticalImprintData(data);
    document.documentElement.dataset.hikariOpticalImprint = JSON.stringify({
      receiverId: field.receiverId,
      sceneRevision: field.sceneRevision,
      lightRevision: field.lightRevision,
      width: data.width,
      height: data.height,
      ...data.diagnostics,
    });
    this.status.dataset.kind = "ready";
    this.status.textContent =
      `${data.diagnostics.causticTexels.toLocaleString()}点の局所集光 · ${data.diagnostics.litTexels.toLocaleString()}点の届いた光 · ${data.diagnostics.coveredTexels.toLocaleString()}点の影`;
  }

  dispose(): void {
    this.renderer.clearOpticalImprint();
    delete document.documentElement.dataset.hikariOpticalImprint;
    delete document.documentElement.dataset.hikariOpticalBody;
    this.group.remove();
  }
}

function makeRange(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
): { root: HTMLDivElement; input: HTMLInputElement; output: HTMLOutputElement } {
  const root = document.createElement("div");
  root.className = "row slider-row";
  const heading = document.createElement("label");
  heading.textContent = label;
  const output = document.createElement("output");
  output.textContent = value.toFixed(2);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.setAttribute("aria-label", label);
  root.append(heading, input, output);
  return { root, input, output };
}

function setRangeValue(
  control: { input: HTMLInputElement; output: HTMLOutputElement },
  value: number,
  digits: number,
): void {
  control.input.value = String(value);
  control.output.textContent = value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}
