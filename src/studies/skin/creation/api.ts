export interface Recipe { flowerScale: number; diameter?: number; kind?: 'external-surface-v1'; algorithm?: string; host?: string; hostScale?: number; upAxis?: string; units?: 'mm'; template?: string; density?: number; seed?: number }
export interface HostInfo { sha256: string; bytes: number; triangles: number; dimensions: number[]; bounds: number[][] }
export interface ResultInfo {
  id: string;
  kind?: string;
  metrics?: { originalHost: HostInfo };
  recipe: Recipe;
  flowerCount: number;
  memberCount: number;
  surfaceHash: string;
  centerlineHash: string;
  meshHash: string;
}
export interface ProjectState {
  history: string[];
  cursor: number;
  compare: string | null;
  selected: string | null;
  results: Record<string, ResultInfo>;
  job: null | { id: string; status: "running" | "failed"; stage: string; error?: string };
  revision: number;
}
export interface TriangleMesh { vertices: number[]; faces: number[] }
export interface SceneData {
  host: TriangleMesh;
  flower: TriangleMesh;
  instances: { position_mm: [number, number, number]; rotation_quaternion_wxyz: [number, number, number, number]; physical_scale: number }[];
  branches: TriangleMesh;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/creation-api${path}`, { cache: "no-store", ...init });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try { const value = JSON.parse(text); message = value.error ?? value.message ?? text; } catch { /* plain HTTP error */ }
    throw new Error(`${response.status}: ${message.slice(0, 1200)}`);
  }
  return response.json() as Promise<T>;
}

export function mutate(path: string, body: unknown = {}): Promise<ProjectState> {
  return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function currentResult(state: ProjectState | null): ResultInfo | undefined {
  return state?.results[state.history[state.cursor]];
}

export function recipeLabel(recipe: Recipe): string {
  if (recipe.kind) return `外部STL · 花 ×${recipe.flowerScale} · 散布 ×${recipe.density} · seed ${recipe.seed}`;
  return `花 ×${recipe.flowerScale === 1 ? "1" : "11/15"} · 枝径 ${recipe.diameter!.toFixed(1)} mm`;
}
