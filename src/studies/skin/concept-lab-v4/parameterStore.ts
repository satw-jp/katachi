export type ParameterValue = number | string | boolean;
export type ParameterKind = "range" | "select" | "toggle" | "color";
export type ParameterUpdateMode = "uniform" | "rebuild" | "restart";

export interface ParameterDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: ParameterKind;
  readonly defaultValue: ParameterValue;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[];
  readonly updateMode: ParameterUpdateMode;
}

export interface GlobalAppearanceParams {
  exposure: number;
  localContrast: number;
  saturation: number;
  blackRetention: number;
  highlightPeak: number;
  blurAmount: number;
  edgeClarity: number;
  cameraDepth: number;
  depthSpread: number;
  foregroundScale: number;
  backgroundScale: number;
  focusDisorder: number;
  cameraDrift: number;
  fieldOfView: number;
  timeScale: number;
  eventDensity: number;
  pauseBias: number;
}

export const GLOBAL_PARAMETER_DEFINITIONS: readonly ParameterDefinition[] = [
  { id: "exposure", label: "Exposure", kind: "range", defaultValue: 1.25, min: 0.25, max: 3, step: 0.05, updateMode: "uniform" },
  { id: "localContrast", label: "Local Contrast", kind: "range", defaultValue: 1.2, min: 0, max: 2, step: 0.05, updateMode: "uniform" },
  { id: "saturation", label: "Saturation", kind: "range", defaultValue: 1.1, min: 0, max: 2, step: 0.05, updateMode: "uniform" },
  { id: "blackRetention", label: "Black Retention", kind: "range", defaultValue: 0.48, min: 0, max: 1, step: 0.02, updateMode: "uniform" },
  { id: "highlightPeak", label: "Highlight Peak", kind: "range", defaultValue: 1.5, min: 0.5, max: 4, step: 0.05, updateMode: "uniform" },
  { id: "blurAmount", label: "Blur", kind: "range", defaultValue: 0.7, min: 0, max: 2, step: 0.05, updateMode: "uniform" },
  { id: "edgeClarity", label: "Edge Clarity", kind: "range", defaultValue: 0.8, min: 0, max: 2, step: 0.05, updateMode: "uniform" },
  { id: "cameraDepth", label: "Camera Depth", kind: "range", defaultValue: 1, min: 0.5, max: 2, step: 0.05, updateMode: "uniform" },
  { id: "depthSpread", label: "Depth Spread", kind: "range", defaultValue: 1, min: 0, max: 2, step: 0.05, updateMode: "uniform" },
  { id: "foregroundScale", label: "Foreground Scale", kind: "range", defaultValue: 1, min: 0.5, max: 3, step: 0.05, updateMode: "uniform" },
  { id: "backgroundScale", label: "Background Scale", kind: "range", defaultValue: 1, min: 0.5, max: 3, step: 0.05, updateMode: "uniform" },
  { id: "focusDisorder", label: "Focus Disorder", kind: "range", defaultValue: 0.6, min: 0, max: 1, step: 0.02, updateMode: "uniform" },
  { id: "cameraDrift", label: "Camera Drift", kind: "range", defaultValue: 0.22, min: 0, max: 1, step: 0.02, updateMode: "uniform" },
  { id: "fieldOfView", label: "Field of View", kind: "range", defaultValue: 46, min: 28, max: 70, step: 1, updateMode: "uniform" },
  { id: "timeScale", label: "Time Scale", kind: "range", defaultValue: 1, min: 0, max: 2, step: 0.05, updateMode: "uniform" },
  { id: "eventDensity", label: "Event Density", kind: "range", defaultValue: 1, min: 0, max: 2, step: 0.05, updateMode: "uniform" },
  { id: "pauseBias", label: "Pause Bias", kind: "range", defaultValue: 0.5, min: 0, max: 1, step: 0.02, updateMode: "uniform" },
] as const;

export function defaultParameters(definitions: readonly ParameterDefinition[]): Record<string, ParameterValue> {
  return Object.fromEntries(definitions.map((definition) => [definition.id, definition.defaultValue]));
}

export function validateParameterValue(definition: ParameterDefinition, value: ParameterValue): boolean {
  if (definition.kind === "range") return typeof value === "number" && Number.isFinite(value) && value >= (definition.min ?? -Infinity) && value <= (definition.max ?? Infinity);
  if (definition.kind === "toggle") return typeof value === "boolean";
  if (definition.kind === "select") return typeof value === "string" && (definition.options?.includes(value) ?? false);
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export class ParameterStore {
  private readonly definitions: readonly ParameterDefinition[];
  private values: Record<string, ParameterValue>;

  constructor(definitions: readonly ParameterDefinition[], initial: Readonly<Record<string, ParameterValue>> = {}) {
    this.definitions = definitions;
    this.values = { ...defaultParameters(definitions) };
    for (const definition of definitions) {
      const value = initial[definition.id];
      if (value !== undefined && validateParameterValue(definition, value)) this.values[definition.id] = value;
    }
  }

  get(id: string): ParameterValue | undefined { return this.values[id]; }
  getDefinitions(): readonly ParameterDefinition[] { return this.definitions; }
  set(id: string, value: ParameterValue): boolean {
    const definition = this.definitions.find((candidate) => candidate.id === id);
    if (!definition || !validateParameterValue(definition, value)) return false;
    this.values[id] = value;
    return true;
  }
  snapshot(): Record<string, ParameterValue> { return { ...this.values }; }
}
