import type { ConceptDefinition } from "./conceptTypes.ts";
import { CONCEPT_CREATORS } from "./concepts.ts";
import type { ParameterDefinition } from "./parameterStore.ts";

function range(id: string, label: string, defaultValue: number, min: number, max: number, step = 0.05, updateMode: ParameterDefinition["updateMode"] = "uniform"): ParameterDefinition {
  return { id, label, kind: "range", defaultValue, min, max, step, updateMode };
}

const CONCEPTS: readonly ConceptDefinition[] = [
  {
    id: "weight-of-hesitation", number: "01", title: "WEIGHT OF HESITATION", statement: "A pause gains weight before another form catches it.",
    parameters: [range("gravity", "Gravity", 0.9, 0, 2), range("hesitationWeight", "Hesitation Weight", 1.1, 0, 2), range("sag", "Sag", 0.75, 0, 1.5), range("catchStiffness", "Catch Stiffness", 1, 0, 2), range("tremor", "Tremor", 0.7, 0, 2), range("weightColor", "Weight Color", 0.8, 0, 1)],
    create: CONCEPT_CREATORS["weight-of-hesitation"],
  },
  {
    id: "mutual-rescue", number: "02", title: "MUTUAL RESCUE", statement: "One flower falls until another learns to hold it.",
    parameters: [range("gravity", "Gravity", 0.65, -1, 2), range("releaseSpread", "Release Spread", 1, 0, 2), range("catchRadius", "Catch Radius", 0.8, 0.1, 2), range("springStiffness", "Spring Stiffness", 1.15, 0, 2), range("damping", "Damping", 0.82, 0, 1), range("rescueLight", "Rescue Light", 1.6, 0, 3)],
    create: CONCEPT_CREATORS["mutual-rescue"],
  },
  {
    id: "void-bouquet", number: "03", title: "VOID BOUQUET", statement: "The space between parts becomes the thing that glows.",
    parameters: [range("voidThreshold", "Void Threshold", 0.46, 0, 1), range("solidExclusion", "Solid Exclusion", 1, 0, 2), range("volumeSteps", "Volume Steps", 64, 24, 96, 8, "rebuild"), range("scattering", "Scattering", 0.9, 0, 2), range("absorption", "Absorption", 0.55, 0, 2), range("depthColor", "Depth Color", 0.7, 0, 1)],
    create: CONCEPT_CREATORS["void-bouquet"],
  },
  {
    id: "inside-out", number: "04", title: "INSIDE OUT", statement: "Support crosses the shell and becomes an outer bloom.",
    parameters: [range("inversion", "Inversion", 0.65, 0, 1), range("supportExpansion", "Support Expansion", 1.6, 0, 4), range("motifImplosion", "Motif Implosion", 0.75, 0, 2), range("phaseDisorder", "Phase Disorder", 0.72, 0, 1), range("shellOpacity", "Shell Opacity", 0.22, 0, 1), range("roleContrast", "Role Contrast", 1.25, 0, 2)],
    create: CONCEPT_CREATORS["inside-out"],
  },
  {
    id: "one-hand-many-flowers", number: "05", title: "ONE HAND / MANY FLOWERS", statement: "One imperfect gesture becomes a family of different flowers.",
    parameters: [range("tracePersistence", "Trace Persistence", 0.32, 0, 1), range("propagationDelay", "Propagation Delay", 1, 0, 3), range("localDeformation", "Local Deformation", 0.85, 0, 2), range("supportPull", "Support Pull", 0.65, 0, 2), range("curvatureColor", "Curvature Color", 1, 0, 2), range("flowerCount", "Flower Count", 38, 1, 38, 1, "rebuild")],
    create: CONCEPT_CREATORS["one-hand-many-flowers"],
  },
  {
    id: "craft-strata", number: "06", title: "CRAFT STRATA", statement: "Material is placed, sags, fuses, and becomes form.",
    parameters: [range("depositionSpeed", "Deposition Speed", 1, 0.1, 3), range("beadVariation", "Bead Variation", 0.42, 0, 1), range("spanSag", "Span Sag", 0.45, 0, 1.5), range("fusion", "Fusion", 0.8, 0, 2), range("handCorrection", "Hand Correction", 0.2, 0, 1), range("layerDisorder", "Layer Disorder", 0.36, 0, 1)],
    create: CONCEPT_CREATORS["craft-strata"],
  },
  {
    id: "shadow-room", number: "07", title: "SHADOW ROOM", statement: "The fixed bouquet is absent; its room keeps changing.",
    parameters: [range("lightCount", "Light Count", 3, 1, 4, 1, "rebuild"), range("sunSpeed", "Sun Speed", 0.35, 0, 2), range("shadowSoftness", "Shadow Softness", 1.1, 0, 2), range("roomScale", "Room Scale", 1.4, 0.5, 3), range("afterimage", "Afterimage", 0.18, 0, 1), range("occluderVisibility", "Occluder Visibility", 0.04, 0, 1)],
    create: CONCEPT_CREATORS["shadow-room"],
  },
  {
    id: "micro-landscape", number: "08", title: "MICRO / LANDSCAPE", statement: "A junction crosses fiber, flower, cloud, and room scale.",
    parameters: [range("journeySpeed", "Journey Speed", 0.7, 0.1, 2), range("scaleRange", "Scale Range", 300, 1, 1000, 10, "rebuild"), range("crossfadeWidth", "Crossfade Width", 0.2, 0.05, 0.5), range("microRoughness", "Micro Roughness", 1, 0, 2), range("macroHaze", "Macro Haze", 0.8, 0, 2), range("cameraDeviation", "Camera Deviation", 0.25, 0, 1)],
    create: CONCEPT_CREATORS["micro-landscape"],
  },
  {
    id: "visible-mending", number: "09", title: "VISIBLE MENDING", statement: "The repair remains as the most vivid part of the form.",
    parameters: [range("woundCount", "Wound Count", 5, 1, 12, 1, "rebuild"), range("gapAmount", "Gap Amount", 0.32, 0, 1), range("stitchDensity", "Stitch Density", 7, 1, 20, 1, "rebuild"), range("repairWidth", "Repair Width", 0.8, 0, 2), range("growthSpeed", "Growth Speed", 0.85, 0.1, 3), range("scarPersistence", "Scar Persistence", 1, 0, 1)],
    create: CONCEPT_CREATORS["visible-mending"],
  },
  {
    id: "structural-choir", number: "10", title: "STRUCTURAL CHOIR", statement: "Many local times keep one structure from falling silent.",
    parameters: [range("coupling", "Coupling", 0.8, 0, 3), range("frequencySpread", "Frequency Spread", 0.9, 0, 2), range("damping", "Damping", 0.18, 0, 1), range("excitation", "Excitation", 0.7, 0, 2), range("vibration", "Vibration", 0.45, 0, 2), range("colorResponse", "Color Response", 1, 0, 2)],
    create: CONCEPT_CREATORS["structural-choir"],
  },
] as const;

export const CONCEPT_DEFINITIONS: readonly ConceptDefinition[] = CONCEPTS;
export const CONCEPT_IDS = CONCEPT_DEFINITIONS.map((concept) => concept.id) as readonly string[];

export function conceptDefinition(id: string): ConceptDefinition {
  return CONCEPT_DEFINITIONS.find((concept) => concept.id === id) ?? CONCEPT_DEFINITIONS[0]!;
}
