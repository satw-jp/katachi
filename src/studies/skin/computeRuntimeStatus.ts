import type { LocalCapabilityProbe } from "./rebuild/geometryEngine/windowsLocalClient.ts";

export type ComputeRuntimeStatus =
  | { state: "checking"; backend: null; detail: string }
  | { state: "healthy"; backend: "cuda" | "cpu"; detail: string }
  | { state: "offline"; backend: null; detail: string };

export const COMPUTE_STATUS_CHECKING: ComputeRuntimeStatus = {
  state: "checking",
  backend: null,
  detail: "helper capabilityを確認しています",
};

export function computeRuntimeStatusFromProbe(
  probe: LocalCapabilityProbe,
  supportsCuda: boolean,
): ComputeRuntimeStatus {
  if (!probe.available) {
    return { state: "offline", backend: null, detail: probe.detail };
  }
  return supportsCuda
    ? { state: "healthy", backend: "cuda", detail: "local helper / CUDA" }
    : { state: "healthy", backend: "cpu", detail: "local helper / CPU" };
}
