import { canonicalStringify } from "./graphCore.ts";
import type { Patch } from "./field.ts";
import type { SkinState } from "./history.ts";

function omitUndefinedProperties<T extends object>(value: T): T {
  const compact: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(value)) {
    if (current !== undefined) compact[key] = current;
  }
  return compact as T;
}

/** Existing Stage 3 source-key input, extracted without changing its bytes. */
export function fkeiArtworkGraphPatches(state: SkinState): Patch[] {
  return state.patches.map((patch) => omitUndefinedProperties({
    ...patch,
    motifParams: patch.motifParams === undefined
      ? undefined
      : omitUndefinedProperties({ ...patch.motifParams }),
    points: patch.points.map((point) => omitUndefinedProperties({ ...point })),
  } as Patch));
}

export function fkeiArtworkGraphSourceKey(state: SkinState): string {
  return canonicalStringify({
    patchSetRevision: state.patchSetRevision,
    patches: fkeiArtworkGraphPatches(state),
  });
}

/** Existing canonical current-Surface predicate, extracted as a pure helper. */
export function fkeiShapeFingerprint(state: SkinState): string {
  return JSON.stringify({
    mode: state.mode,
    hostK: state.hostParams.k,
    host: state.host.map((ball) => [ball.x, ball.y, ball.z, ball.r]),
    thickness: state.skinParams.thickness,
    roundK: state.skinParams.roundK,
    coinBulge: state.skinParams.coinBulge,
    coinBulgeBalance: state.skinParams.coinBulgeBalance,
    quadMeshJoinWidth: state.skinParams.quadMeshJoinWidth,
    patches: state.patches.map((patch) => [
      patch.id,
      patch.shape,
      patch.points.map((point) => [point.x, point.y, point.z, point.r, point.role ?? ""]),
    ]),
  });
}
