// ---------------------------------------------------------------------------
// WebGPU capability detection (T2e "能力検出で自動選択"). One entry point:
// requestWebGpuDevice() tries adapter -> device once and caches the result
// (a module-level promise) so main.ts and gpuSim.ts share a single GPUDevice
// instead of racing separate requestAdapter() calls. Resolves to null (never
// throws) on any failure -- the caller falls back to the CPU backend
// (sim.ts), which is why this module exposes nothing but "can I get a
// working device", not per-feature probing: T2e's physics doesn't need any
// optional WebGPU feature beyond core compute + storage-buffer atomics
// (both part of the base spec, not an opt-in feature flag).
// ---------------------------------------------------------------------------

export type BackendKind = "cpu" | "webgpu";

export interface WebGpuHandle {
  device: GPUDevice;
  /** Human-readable adapter identity for the backend badge / README reporting, best-effort (adapter.info is optional per spec). */
  adapterInfo: string;
}

/**
 * Why WebGPU is unavailable, when it is — so the badge can say the REASON
 * instead of a bare "CPU" (正直さ: どちらで計算しているかだけでなく、なぜかも隠さない).
 * The big real-world one: WebGPU requires a secure context (localhost or
 * HTTPS). Opening the dev server over LAN as http://192.168.x.x makes
 * navigator.gpu undefined entirely — observed on the author's Windows
 * machine, 2026-07-10.
 */
export function webGpuUnavailableReason(): string | null {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (nav.gpu) return null;
  if (!window.isSecureContext) {
    return "HTTP(非セキュア)接続のため WebGPU が無効です。localhost か HTTPS で開くか、ブラウザのフラグでこのアドレスを許可してください";
  }
  return "このブラウザは WebGPU 非対応です";
}

let cached: Promise<WebGpuHandle | null> | null = null;

/** Cached WebGPU device request. Safe to call repeatedly (e.g. from multiple modules at startup) -- only probes once. */
export function requestWebGpuDevice(): Promise<WebGpuHandle | null> {
  if (!cached) cached = detect();
  return cached;
}

async function detect(): Promise<WebGpuHandle | null> {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (!nav.gpu) return null;
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    if (!device) return null;
    device.lost
      .then((info) => {
        // eslint-disable-next-line no-console
        console.warn("[mpm/gpu] WebGPU device lost:", info.message);
      })
      .catch(() => {});
    const info = (adapter as unknown as { info?: { vendor?: string; architecture?: string; device?: string; description?: string } }).info;
    const adapterInfo = info
      ? [info.vendor, info.architecture, info.device, info.description].filter((s) => s && s.length > 0).join(" / ") || "adapter (詳細不明)"
      : "adapter (詳細不明)";
    return { device, adapterInfo };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[mpm/gpu] WebGPU device request failed, falling back to CPU:", err);
    return null;
  }
}
