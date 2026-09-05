import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import type { PatchPoint } from "./field.ts";
import type { ExternalStlHostV6Adapter, HostAuthoredFlowerMotif } from "./externalStlHostV6Adapter.ts";

export type AuthorGateMotifSizeMode = "uniform" | "varied";

export interface AuthorGateMotifSettings {
  readonly sizeMode: AuthorGateMotifSizeMode;
  readonly baseSize: number;
  readonly sizeVariance: number;
}

export interface AuthorGateGenerationOptions extends AuthorGateMotifSettings {
  readonly minimumClearance: number;
}

function scalePoint(point: PatchPoint, anchor: HostAuthoredFlowerMotif["hostPlacement"]["position"], factor: number): PatchPoint {
  const scaleOptional = (value: number | undefined): number | undefined => value === undefined ? undefined : value * factor;
  return {
    ...point,
    x: anchor.x + (point.x - anchor.x) * factor,
    y: anchor.y + (point.y - anchor.y) * factor,
    z: anchor.z + (point.z - anchor.z) * factor,
    r: point.r * factor,
    ...(point.baseR === undefined ? {} : { baseR: scaleOptional(point.baseR) }),
    ...(point.fusionBaseR === undefined ? {} : { fusionBaseR: scaleOptional(point.fusionBaseR) }),
    ...(point.fusionR === undefined ? {} : { fusionR: scaleOptional(point.fusionR) }),
    ...(point.meshJoinR === undefined ? {} : { meshJoinR: scaleOptional(point.meshJoinR) }),
    ...(point.contactR === undefined ? {} : { contactR: scaleOptional(point.contactR) }),
  };
}

function deterministicScale(adapter: ExternalStlHostV6Adapter, motifId: number, settings: AuthorGateMotifSettings): number {
  if (settings.sizeMode === "uniform" || settings.sizeVariance === 0) return 1;
  const rng = makeRng(hashSeed(`${adapter.host.source.sourceIdentity.sha256}:author-gate-size:${motifId}`));
  const t = rng();
  const lower = Math.max(0.65, 1 - settings.sizeVariance);
  const upper = Math.min(1.55, 1 + settings.sizeVariance);
  return lower + (upper - lower) * t;
}

export function generateAuthorGateMotifs(
  adapter: ExternalStlHostV6Adapter,
  count: number,
  options: AuthorGateGenerationOptions,
): readonly HostAuthoredFlowerMotif[] {
  if (!Number.isInteger(count) || count < 0) throw new Error("Author Gate motif count must be a non-negative integer");
  if (!(options.baseSize > 0) || !Number.isFinite(options.baseSize)) throw new Error("Author Gate base size must be positive and finite");
  if (!(options.sizeVariance >= 0 && options.sizeVariance <= 1) || !Number.isFinite(options.sizeVariance)) throw new Error("Author Gate size variance must be between 0 and 1");
  if (!(options.minimumClearance >= 0) || !Number.isFinite(options.minimumClearance)) throw new Error("Author Gate minimum clearance must be finite and non-negative");
  const generated = adapter.placeFlowers(count, undefined, options.baseSize, {
    seed: adapter.seed,
    minimumClearance: options.minimumClearance,
  });
  return Object.freeze(generated.map((motif) => {
    const factor = deterministicScale(adapter, motif.id, options);
    if (factor === 1) return motif;
    const points = motif.points.map((point) => scalePoint(point, motif.hostPlacement.position, factor));
    return Object.freeze({ ...motif, points });
  }));
}
