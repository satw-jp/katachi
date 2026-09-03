import {
  HANA_FINALIZATION_ALGORITHM_VERSION,
  HANA_FINALIZATION_SNAPSHOT_FORMAT,
  computeHanaFinalization,
  type HanaComputeCancellation,
  type HanaFinalizationComputeOptions,
  type HanaFinalizationResultV0,
  type HanaFinalizationSnapshotV0,
} from "./finalizationCore.ts";
import { HANA_COMPUTE_PROTOCOL_VERSION } from "./computeProtocol.ts";

export const HANA_COMPUTE_CAPABILITY_VERSION = "katachi.hana-compute-capability.v0" as const;

export type HanaComputeExecutionKind = "cpu" | "gpu" | "native";

export interface HanaComputeEngineCapabilities {
  capabilityVersion: typeof HANA_COMPUTE_CAPABILITY_VERSION;
  engineId: string;
  algorithmVersion: string;
  executionKind: HanaComputeExecutionKind;
  gpu: boolean;
  supportsCancellation: boolean;
  supportsObjectLevel: boolean;
  supportedSnapshotVersion: string;
  supportedProtocolVersion: string;

  /** Compatibility aliases retained for the existing backend/UI contract. */
  engine: string;
  binaryMesh: true;
  cancellation: boolean;
  objectLevelFinalization: boolean;
}

export interface HanaComputeEngine {
  readonly id: string;
  readonly capabilities: HanaComputeEngineCapabilities;
  finalize(
    snapshot: HanaFinalizationSnapshotV0,
    cancellation?: HanaComputeCancellation,
    options?: HanaFinalizationComputeOptions,
  ): Promise<HanaFinalizationResultV0>;
}

export const HANA_CPU_ENGINE_CAPABILITIES: HanaComputeEngineCapabilities = {
  capabilityVersion: HANA_COMPUTE_CAPABILITY_VERSION,
  engineId: "cpu-js-v0",
  algorithmVersion: HANA_FINALIZATION_ALGORITHM_VERSION,
  executionKind: "cpu",
  gpu: false,
  supportsCancellation: true,
  supportsObjectLevel: true,
  supportedSnapshotVersion: HANA_FINALIZATION_SNAPSHOT_FORMAT,
  supportedProtocolVersion: HANA_COMPUTE_PROTOCOL_VERSION,
  engine: "cpu-js-v0",
  binaryMesh: true,
  cancellation: true,
  objectLevelFinalization: true,
};

export interface HanaComputeCompatibilityInput {
  snapshotVersion?: string;
  protocolVersion?: string;
  algorithmVersion?: string;
  engineId?: string;
}

export function assertHanaComputeEngineCompatibility(
  capabilities: HanaComputeEngineCapabilities,
  input: HanaComputeCompatibilityInput,
): void {
  if (input.snapshotVersion !== undefined && input.snapshotVersion !== capabilities.supportedSnapshotVersion) {
    throw new Error(`Unsupported snapshot version for ${capabilities.engineId}`);
  }
  if (input.protocolVersion !== undefined && input.protocolVersion !== capabilities.supportedProtocolVersion) {
    throw new Error(`Unsupported protocol version for ${capabilities.engineId}`);
  }
  if (input.algorithmVersion !== undefined && input.algorithmVersion !== capabilities.algorithmVersion) {
    throw new Error(`Unsupported algorithm version for ${capabilities.engineId}`);
  }
  if (input.engineId !== undefined && input.engineId !== capabilities.engineId) {
    throw new Error(`Engine identity mismatch: ${input.engineId}`);
  }
}

export interface HanaComputeEngineFactory {
  id: string;
  create: () => HanaComputeEngine;
}

const engineFactories = new Map<string, HanaComputeEngineFactory>();

export function registerHanaComputeEngine(factory: HanaComputeEngineFactory): void {
  if (!factory.id || engineFactories.has(factory.id)) throw new Error(`HANA compute engine is already registered: ${factory.id}`);
  const engine = factory.create();
  if (engine.id !== factory.id) throw new Error(`HANA compute engine factory id mismatch: ${factory.id}`);
  engineFactories.set(factory.id, factory);
}

export function createHanaComputeEngine(engineId = "cpu-js-v0"): HanaComputeEngine {
  const factory = engineFactories.get(engineId);
  if (!factory) throw new Error(`Unknown HANA compute engine: ${engineId}`);
  return factory.create();
}

export function registeredHanaComputeEngineIds(): string[] {
  return [...engineFactories.keys()];
}

/** The only runtime v0 engine. A future engine must preserve the same result contract. */
export class CpuJsHanaComputeEngine implements HanaComputeEngine {
  readonly id = "cpu-js-v0";
  readonly capabilities = HANA_CPU_ENGINE_CAPABILITIES;

  finalize(
    snapshot: HanaFinalizationSnapshotV0,
    cancellation?: HanaComputeCancellation,
    options?: HanaFinalizationComputeOptions,
  ): Promise<HanaFinalizationResultV0> {
    return computeHanaFinalization(snapshot, cancellation, options);
  }
}

registerHanaComputeEngine({
  id: "cpu-js-v0",
  create: () => new CpuJsHanaComputeEngine(),
});
