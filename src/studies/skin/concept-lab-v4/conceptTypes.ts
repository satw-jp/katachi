import * as THREE from "three";
import type { ConceptSource } from "./sourceAdapter.ts";
import type { ParameterDefinition, ParameterValue } from "./parameterStore.ts";

export type PaletteName = "rich" | "red" | "blue" | "monochrome" | "custom";

export interface PaletteColors {
  readonly primary: number;
  readonly secondary: number;
  readonly highlight: number;
  readonly shadow: number;
  readonly accent: number;
}

export const V4_PALETTES: Record<Exclude<PaletteName, "custom">, PaletteColors> = {
  rich: { primary: 0xe66b60, secondary: 0x48a9b6, highlight: 0xf4d58e, shadow: 0x39203e, accent: 0x9c7bc9 },
  red: { primary: 0xa7293b, secondary: 0x6a172a, highlight: 0xffb8a8, shadow: 0x210b19, accent: 0xe26168 },
  blue: { primary: 0x1c5a95, secondary: 0x2ba8bd, highlight: 0xd9f4ec, shadow: 0x0b193d, accent: 0x7568c4 },
  monochrome: { primary: 0xd9ded7, secondary: 0x8f9a95, highlight: 0xffffff, shadow: 0x1c2422, accent: 0xb4c3bc },
};

export interface ConceptBuildContext {
  readonly source: Readonly<ConceptSource>;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly seed: number;
  readonly quality: "mobile" | "desktop" | "capture";
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly palette: PaletteName;
  readonly colors: PaletteColors;
  /** Presentation-only switch. Baseline keeps the pre-lift V4 renderer intact. */
  readonly visualQuality?: "baseline" | "lifted";
}

export interface ConceptFrameContext {
  readonly elapsedSeconds: number;
  readonly deltaSeconds: number;
  readonly localTime: number;
  readonly eventEnergy: number;
  readonly paused: boolean;
}

export interface ConceptInstance {
  update(frame: ConceptFrameContext): void;
  applyUniformParameters(parameters: Readonly<Record<string, ParameterValue>>): void;
  captureState(): unknown;
  dispose(): void;
}

export interface ConceptDefinition {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly statement: string;
  readonly parameters: readonly ParameterDefinition[];
  readonly create: (context: ConceptBuildContext) => ConceptInstance;
}
