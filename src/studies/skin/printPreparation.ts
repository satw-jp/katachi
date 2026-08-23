// Print-preparation bridge for S-skin.
//
// Katachi remains the owner of the generative field and recipe. The local
// Optimizer engine only receives the generated STL bytes and returns measured
// mesh diagnostics. Keeping this boundary explicit lets the author complete
// the whole flow in one screen without teaching Optimizer how to replay a
// Katachi recipe.

export const OPTIMIZER_ENGINE_URL = "http://127.0.0.1:5178";

export interface PrintCheckProgress {
  percent: number;
  stage: string;
  elapsedSeconds: number;
}

export interface PrintCheckOptions {
  quick?: boolean;
  requestTimeoutMs?: number;
  pollTimeoutMs?: number;
}

export interface PrintCheckSummary {
  watertight: boolean;
  shellCount: number;
  sizeMm: [number, number, number];
  wallP05Mm: number | null;
  internalOverhangRatio: number;
  totalOverhangRatio: number;
  bestInternalOverhangRatio: number | null;
  bestDirection: [number, number, number] | null;
  rawReport: unknown;
}

type PageLocation = { protocol: string; hostname: string };

export function optimizerAccessMessage(
  pageLocation: PageLocation | undefined = typeof window === "undefined" ? undefined : window.location,
): string | null {
  if (!pageLocation) return null;
  const localPage = pageLocation.hostname === "localhost" || pageLocation.hostname === "127.0.0.1";
  if (localPage) return null;
  return "公開版は形状確認用です。Optimizer診断はKatachiを起動し、http://localhost:5174/skin.html で実行してください";
}

type OptimizerJob = {
  status: "running" | "complete" | "error";
  percent?: number;
  stage?: string;
  elapsed_seconds?: number;
  message?: string;
  result?: { report?: unknown };
};

function triple(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(Number(item)))) {
    throw new Error("Optimizerの寸法結果を読み取れませんでした");
  }
  return [Number(value[0]), Number(value[1]), Number(value[2])];
}

export function summarizeOptimizerReport(value: unknown): PrintCheckSummary {
  const report = value as any;
  if (!report?.topology || !report?.overhang_estimate || !report?.bounding_box_mm || !report?.shells) {
    throw new Error("Optimizerの診断結果が不完全です");
  }
  const best = report.orientation_scan?.best?.[0];
  return {
    watertight: Boolean(report.topology.watertight),
    shellCount: Number(report.shells.count),
    sizeMm: triple(report.bounding_box_mm.extents),
    wallP05Mm: report.wall_thickness_estimate?.p05_mm == null
      ? null
      : Number(report.wall_thickness_estimate.p05_mm),
    internalOverhangRatio: Number(report.overhang_estimate.internal_potential_ratio),
    totalOverhangRatio: Number(report.overhang_estimate.potential_ratio),
    bestInternalOverhangRatio: best?.internal_potential_ratio == null
      ? null
      : Number(best.internal_potential_ratio),
    bestDirection: best?.direction == null ? null : triple(best.direction),
    rawReport: report,
  };
}

async function readJson(response: Response): Promise<any> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? `Optimizer HTTP ${response.status}`);
  }
  return payload;
}

export async function checkGeneratedStl(
  stl: ArrayBuffer,
  filename: string,
  onProgress: (progress: PrintCheckProgress) => void,
  options: PrintCheckOptions = {},
): Promise<PrintCheckSummary> {
  const accessMessage = optimizerAccessMessage();
  if (accessMessage) throw new Error(accessMessage);

  onProgress({ percent: 0, stage: "Optimizer接続を確認中", elapsedSeconds: 0 });
  let health: Response;
  try {
    health = await fetch(`${OPTIMIZER_ENGINE_URL}/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error("印刷確認エンジンが起動していません。Katachiを起動し直してください");
  }
  const healthPayload = await readJson(health);
  if (healthPayload?.service !== "optimizer-engine") {
    throw new Error("接続先が印刷確認エンジンではありません");
  }

  onProgress({ percent: 1, stage: "同一STLをOptimizerへ送信中", elapsedSeconds: 0 });
  const form = new FormData();
  form.append("file", new Blob([stl], { type: "model/stl" }), filename);
  form.append("scale", "1");
  form.append("component", "all");
  form.append("quick", String(options.quick ?? false));
  const started = await readJson(await fetch(`${OPTIMIZER_ENGINE_URL}/check-job`, {
    method: "POST", body: form, signal: AbortSignal.timeout(options.requestTimeoutMs ?? 60_000),
  }));
  if (!started?.job_id) throw new Error("印刷確認を開始できませんでした");

  let consecutivePollFailures = 0;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    let job: OptimizerJob;
    try {
      job = await readJson(await fetch(`${OPTIMIZER_ENGINE_URL}/check-jobs/${started.job_id}`, {
        signal: AbortSignal.timeout(options.pollTimeoutMs ?? 10_000),
      })) as OptimizerJob;
      consecutivePollFailures = 0;
    } catch {
      consecutivePollFailures++;
      if (consecutivePollFailures >= 3) throw new Error("Optimizerの応答が止まりました。エンジン状態を確認して再試行してください");
      onProgress({ percent: 2, stage: `Optimizer応答を再確認中 ${consecutivePollFailures}/3`, elapsedSeconds: 0 });
      continue;
    }
    onProgress({
      percent: Number(job.percent ?? 0),
      stage: job.stage ?? "確認中",
      elapsedSeconds: Number(job.elapsed_seconds ?? 0),
    });
    if (job.status === "error") throw new Error(job.message ?? "印刷確認に失敗しました");
    if (job.status === "complete") return summarizeOptimizerReport(job.result?.report);
  }
}

export function formatDirection(direction: [number, number, number] | null): string {
  if (!direction) return "—";
  const labels = ["X", "Y", "Z"];
  const index = direction.reduce((best, value, i) => Math.abs(value) > Math.abs(direction[best]) ? i : best, 0);
  return `${direction[index] >= 0 ? "+" : "−"}${labels[index]}`;
}
