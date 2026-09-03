import { canonicalStringify } from "../graphCore.ts";

export const SKIN_REBUILD_GOLDEN_FKEI = {
  filename: "skin-rebuild-print-002-support-free.fkei",
  bytes: 249547,
  sha256: "21206dbe66fa9fc372c378b4166b18323ce297bd079c4bd405e7cc508a66e08d",
} as const;

export type GoldenVector = { x: number; y: number; z: number };

export type GoldenRouteFacts = {
  candidateId: string;
  kind: "vertical" | "leaning";
  root: GoldenVector;
  lowerShaftEnd: GoldenVector | null;
  bend: GoldenVector | null;
  neckStart: GoldenVector;
  target: GoldenVector;
};

export type SkinRebuildGoldenSnapshot = {
  fkei: typeof SKIN_REBUILD_GOLDEN_FKEI;
  settingsFingerprint: string;
  stage4: {
    allFaceCount: number;
    allRegionCount: number;
    insideFaceCount: number;
    insideRegionCount: number;
    outsideFaceCount: number;
    outsideRegionCount: number;
    classificationFingerprint: string;
  };
  body: {
    faceCount: number;
    positionsFingerprint: string;
    bounds: { min: GoldenVector; max: GoldenVector };
  };
  criticalTargets: {
    count: number;
    fingerprint: string;
  };
  supportGraph: {
    nodeCount: number;
    edgeCount: number;
    fingerprint: string;
  };
  diagnostics: {
    supportedTargetCount: number;
    unsupportedTargetCount: number;
    generatedSupportCount: number;
    straightRejectedByBody: number;
    acceptedBodyCollisionCount: 0;
    insideDerivedSupportCount: 0;
    verticalCount: number;
    leaningCount: number;
    offsetBendCount: number;
    routeCandidateCount: number;
    routeFingerprint: string;
  };
  representativeRoutes: {
    vertical: GoldenRouteFacts | null;
    offsetBend: GoldenRouteFacts | null;
  };
};

export const SKIN_REBUILD_GOLDEN_EXPECTED: SkinRebuildGoldenSnapshot = {
  fkei: SKIN_REBUILD_GOLDEN_FKEI,
  settingsFingerprint: "4683e813909354b7baa358ffa4b912fefed95172c5adb21d53412466ba6745ce",
  stage4: {
    allFaceCount: 1224,
    allRegionCount: 86,
    insideFaceCount: 736,
    insideRegionCount: 73,
    outsideFaceCount: 488,
    outsideRegionCount: 53,
    classificationFingerprint: "e9f90339cae1db3f936cb5ab89f44132d2f8364591a9064b22f355e2a33eff65",
  },
  body: {
    faceCount: 222636,
    positionsFingerprint: "f2e316386474637ab32357a9147c4418b56b7ac7dfc83985d674cb4aaa3a69ee",
    bounds: {
      min: { x: -0.9298405647277832, y: -0.9306714534759521, z: -2.266134023666382 },
      max: { x: 0.919206440448761, y: 0.9021838307380676, z: 2.2655112743377686 },
    },
  },
  criticalTargets: {
    count: 166,
    fingerprint: "01c3db20aeed014d939588573ca5b94351dd6d5ba3f1553ebd1ca477ad2cfcfa",
  },
  supportGraph: {
    nodeCount: 546,
    edgeCount: 390,
    fingerprint: "97b65f8aaef024be54865d38397b8df140022e760ac352345068d86e855100a6",
  },
  diagnostics: {
    supportedTargetCount: 156,
    unsupportedTargetCount: 10,
    generatedSupportCount: 156,
    straightRejectedByBody: 88,
    acceptedBodyCollisionCount: 0,
    insideDerivedSupportCount: 0,
    verticalCount: 78,
    leaningCount: 78,
    offsetBendCount: 78,
    routeCandidateCount: 4686,
    routeFingerprint: "efa605f7fcd68adeb853318391d2300918ef1ac858fdbb5bdd710a99ccb96b82",
  },
  representativeRoutes: {
    vertical: {
      candidateId: "outside-0-0",
      kind: "vertical",
      root: { x: 0.2874672184236002, y: 0.23713258726994793, z: -2.266134023666382 },
      lowerShaftEnd: { x: 0.2874672184236002, y: 0.23713258726994793, z: -2.2248549314814388 },
      bend: null,
      neckStart: { x: 0.2874672184236002, y: 0.23713258726994793, z: -2.2248549314814388 },
      target: { x: 0.2619379709164302, y: 0.2252362221479416, z: -2.1936983267466226 },
    },
    offsetBend: {
      candidateId: "outside-91-0",
      kind: "leaning",
      root: { x: -0.15693982040651183, y: -0.626484146997305, z: -2.266134023666382 },
      lowerShaftEnd: { x: -0.15693982040651183, y: -0.626484146997305, z: -1.5463707972967216 },
      bend: { x: -0.4257398204065118, y: -0.626484146997305, z: -1.1624846130844413 },
      neckStart: { x: -0.4257398204065118, y: -0.626484146997305, z: -1.1624846130844413 },
      target: { x: -0.40094902118047077, y: -0.6392199198404948, z: -1.1310646136601765 },
    },
  },
};

/** Keep fingerprints explicit about the field they protect and the order of
 * arrays. This is intentionally a pure serialization helper so browser and
 * Node regression checks share the same identity rule. */
export function goldenFingerprintPayload(label: string, value: unknown): string {
  return `${label}\n${canonicalStringify(value)}`;
}

export function goldenVector(value: GoldenVector): GoldenVector {
  return { x: value.x, y: value.y, z: value.z };
}

export function goldenBounds(positions: ArrayLike<number>): { min: GoldenVector; max: GoldenVector } {
  if (positions.length % 3 !== 0 || positions.length === 0) {
    throw new Error("Golden BODY bounds require a non-empty XYZ buffer");
  }
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < positions.length; i += 3) {
    min.x = Math.min(min.x, positions[i]);
    min.y = Math.min(min.y, positions[i + 1]);
    min.z = Math.min(min.z, positions[i + 2]);
    max.x = Math.max(max.x, positions[i]);
    max.y = Math.max(max.y, positions[i + 1]);
    max.z = Math.max(max.z, positions[i + 2]);
  }
  return { min, max };
}

/** Compare a browser-captured snapshot with the frozen golden vector and stop
 * at the first changed field so a recovery run reports an actionable mismatch. */
export function assertSkinRebuildGoldenSnapshot(
  actual: SkinRebuildGoldenSnapshot,
  expected: SkinRebuildGoldenSnapshot = SKIN_REBUILD_GOLDEN_EXPECTED,
): void {
  const fields: Array<[string, unknown, unknown]> = [
    ["fkei", actual.fkei, expected.fkei],
    ["settingsFingerprint", actual.settingsFingerprint, expected.settingsFingerprint],
    ["stage4", actual.stage4, expected.stage4],
    ["body", actual.body, expected.body],
    ["criticalTargets", actual.criticalTargets, expected.criticalTargets],
    ["supportGraph", actual.supportGraph, expected.supportGraph],
    ["diagnostics", actual.diagnostics, expected.diagnostics],
    ["representativeRoutes", actual.representativeRoutes, expected.representativeRoutes],
  ];
  for (const [label, actualValue, expectedValue] of fields) {
    if (canonicalStringify(actualValue) !== canonicalStringify(expectedValue)) {
      throw new Error(`SKIN golden mismatch at ${label}`);
    }
  }
}
