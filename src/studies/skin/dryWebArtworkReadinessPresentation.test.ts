import {
  createDryWebArtworkReadinessPresentation,
  dryWebArtworkReadinessEvidenceLabel,
  type DryWebArtworkReadinessInput,
} from "./dryWebArtworkReadinessPresentation.ts";

const configured = {
  requiredContacts: 3,
  minimumDiameterMm: 1.6,
  maximumUnreinforcedSpanMm: 12,
};

const currentInput = (): DryWebArtworkReadinessInput => ({
  stage3: "current",
  stage4: "current",
  stage7: "current",
  surface: {
    elementCount: 4,
    requiredContacts: 3,
    passingElementCount: 4,
    insufficientElementCount: 0,
  },
  graph: {
    nodeCount: 7,
    edgeCount: 6,
    componentCount: 1,
    mainComponentSize: 4,
  },
  separation: {
    tealFaceCount: 10,
    orangeFaceCount: 2,
    redFaceCount: 0,
  },
  configured,
});

const row = (input: ReturnType<typeof createDryWebArtworkReadinessPresentation>, key: string) => {
  const result = input.rows.find((candidate) => candidate.key === key);
  if (!result) throw new Error(`missing readiness row: ${key}`);
  return result;
};

const missing = createDryWebArtworkReadinessPresentation({
  ...currentInput(),
  stage3: "missing",
  surface: null,
  graph: null,
  separation: null,
});
if (missing.overall !== "未確認"
  || row(missing, "surface-elements").value !== "—"
  || row(missing, "graph-nodes").value !== "—"
  || row(missing, "separation-red").value !== "—"
  || !missing.action.includes("Stage 3")
  || !missing.action.includes("Artwork Graph化")) {
  throw new Error("missing Stage 3 input must hide old counts and request re-Graphize");
}
if (row(missing, "minimum-diameter").value !== "1.60 mm"
  || dryWebArtworkReadinessEvidenceLabel(row(missing, "minimum-diameter").evidence) !== "設定値・実測未判定"
  || !missing.unmeasuredNote.includes("mesh union")
  || !missing.unmeasuredNote.includes("watertightness")
  || !missing.unmeasuredNote.includes("mechanical strength")
  || !missing.unmeasuredNote.includes("slicer result")) {
  throw new Error("missing state must keep configured physical targets and the persistent unmeasured note");
}

for (const stage4 of ["running", "stale"] as const) {
  const state = createDryWebArtworkReadinessPresentation({
    ...currentInput(),
    stage4,
    surface: null,
    graph: null,
    separation: null,
  });
  if (state.overall !== "未確認"
    || row(state, "surface-pass").value !== "—"
    || row(state, "graph-edges").value !== "—"
    || !state.action.includes("Stage 4")
    || !state.action.includes("Dry Web")) {
    throw new Error(`Stage 4 ${stage4} must hide old counts and request generate/re-diagnose`);
  }
}

const missingStage7 = createDryWebArtworkReadinessPresentation({
  ...currentInput(),
  stage7: "missing",
  separation: null,
});
if (missingStage7.overall !== "未確認"
  || row(missingStage7, "graph-components").value !== "1"
  || row(missingStage7, "separation-red").value !== "—"
  || !missingStage7.action.includes("Stage 7")
  || !missingStage7.action.includes("exact")) {
  throw new Error("missing Stage 7 separation must preserve current generator facts and request exact separation");
}

const insufficient = createDryWebArtworkReadinessPresentation({
  ...currentInput(),
  surface: { ...currentInput().surface!, passingElementCount: 3, insufficientElementCount: 1 },
});
if (insufficient.overall !== "調整が必要" || !insufficient.overallReason.includes("insufficient 1要素")) {
  throw new Error("current insufficient elements must require adjustment");
}

const red = createDryWebArtworkReadinessPresentation({
  ...currentInput(),
  separation: { ...currentInput().separation!, redFaceCount: 2 },
});
if (red.overall !== "調整が必要" || !red.overallReason.includes("赤 2面")) {
  throw new Error("current red faces must require adjustment");
}

const multiComponent = createDryWebArtworkReadinessPresentation({
  ...currentInput(),
  graph: { ...currentInput().graph!, componentCount: 2 },
});
if (multiComponent.overall !== "調整が必要" || !multiComponent.overallReason.includes("component 2")) {
  throw new Error("current multi-component graph must require adjustment");
}

const pass = createDryWebArtworkReadinessPresentation(currentInput());
if (pass.overall !== "候補条件通過・最終未判定"
  || row(pass, "surface-elements").value !== "4"
  || row(pass, "required-contacts").value !== "3"
  || row(pass, "surface-pass").value !== "4"
  || row(pass, "surface-insufficient").value !== "0"
  || row(pass, "graph-nodes").value !== "7"
  || row(pass, "graph-edges").value !== "6"
  || row(pass, "graph-components").value !== "1"
  || row(pass, "graph-main-component").value !== "4"
  || row(pass, "separation-teal").value !== "10"
  || row(pass, "separation-orange").value !== "2"
  || row(pass, "separation-red").value !== "0") {
  throw new Error("candidate pass must preserve every exact current count");
}
if (row(pass, "surface-elements").evidence !== "current-generator-fact"
  || row(pass, "separation-red").evidence !== "current-exact-recheck-fact"
  || row(pass, "required-contacts").evidence !== "configured-only") {
  throw new Error("readiness rows must identify generator, exact-recheck, and configured evidence");
}

const before = JSON.stringify(currentInput());
createDryWebArtworkReadinessPresentation(currentInput());
if (JSON.stringify(currentInput()) !== before) throw new Error("readiness presentation must not mutate input");

console.log("dryWebArtworkReadinessPresentation: missing/stale/current outcomes, exact counts, labels, and immutability passed");
