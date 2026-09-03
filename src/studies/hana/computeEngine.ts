import {
  computeHanaFinalization,
  type HanaComputeCancellation,
  type HanaFinalizationComputeOptions,
  type HanaFinalizationResultV0,
  type HanaFinalizationSnapshotV0,
} from "./finalizationCore.ts";

export interface HanaComputeEngineCapabilities {
  engine: "cpu-js-v0";
  binaryMesh: true;
  cancellation: true;
  objectLevelFinalization: true;
  gpu: false;
}

export interface HanaComputeEngine {
  readonly id: "cpu-js-v0";
  readonly capabilities: HanaComputeEngineCapabilities;
  finalize(
    snapshot: HanaFinalizationSnapshotV0,
    cancellation?: HanaComputeCancellation,
    options?: HanaFinalizationComputeOptions,
  ): Promise<HanaFinalizationResultV0>;
}

export const HANA_CPU_ENGINE_CAPABILITIES: HanaComputeEngineCapabilities = {
  engine: "cpu-js-v0",
  binaryMesh: true,
  cancellation: true,
  objectLevelFinalization: true,
  gpu: false,
};

/** The only v0 engine. A future engine must preserve the same result contract. */
export class CpuJsHanaComputeEngine implements HanaComputeEngine {
  readonly id = "cpu-js-v0" as const;
  readonly capabilities = HANA_CPU_ENGINE_CAPABILITIES;

  finalize(
    snapshot: HanaFinalizationSnapshotV0,
    cancellation?: HanaComputeCancellation,
    options?: HanaFinalizationComputeOptions,
  ): Promise<HanaFinalizationResultV0> {
    return computeHanaFinalization(snapshot, cancellation, options);
  }
}
