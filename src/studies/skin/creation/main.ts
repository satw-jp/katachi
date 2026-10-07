import { createPrintUI } from './print.ts';
import { currentResult, mutate, recipeLabel, request, type ProjectState, type Recipe, type ResultInfo } from "./api.ts";
import { CreationView } from "./view.ts";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Creation UI root is missing");
root.innerHTML = `
<main class="creation-app">
  <header><div><p class="eyebrow">KATACHI / SKIN</p><h1>Creation <span>v0</span></h1></div>
    <div class="file-tools"><button id="new-project">新しいプロジェクト</button><button id="save-project" disabled>保存 .skincreation</button>
      <label class="file-label">保存を開く<input id="open-project" type="file" accept=".skincreation,application/zip" /></label></div>
  </header>
  <section class="creation-toolbar" aria-label="履歴と表示">
    <button id="undo" disabled>Undo</button><button id="redo" disabled>Redo</button><span id="history-position">履歴なし</span>
    <div class="view-tools"><label><input id="show-host" type="checkbox" checked />ベース</label><label><input id="show-flowers" type="checkbox" checked />花</label><label><input id="show-branches" type="checkbox" checked />内部枝</label><button id="fit-view">全体表示</button></div>
  </section>
  <div class="creation-layout">
    <section class="creation-stage" aria-label="実生成結果の比較">
      <div id="viewport"></div><div id="view-labels" class="view-labels"></div>
      <p id="empty-view">mini MOCOMOCO ＋ D6<br />右の「花・内部枝を生成」から制作を始めます。</p>
      <div class="view-help">ドラッグ：回転 · ホイール：拡大 · 右ドラッグ：移動<br />比較は同一カメラ・同一実寸。花は省略せず表示。</div>
    </section>
    <aside>
      <section><p class="eyebrow">01 / SOURCE</p><h2>ベースと花</h2>
        <p><strong>mini MOCOMOCO</strong><br />150.06 × 161.33 × 152.92 mm（固定）</p>
        <p><strong>D6 / デフォルト花</strong><br />10.87 × 10.07 × 3.14 mm × q × g<br /><small>q：元の個体差、g：下の花倍率。ベースの縮尺とは独立。</small></p>
        <p class="note">このv0は検証済みの組合せ専用です。カスタムHost・花の読込には未対応。</p>
      </section>
      <section><p class="eyebrow">02 / COMPOSE</p><h2>全体バランス</h2>
        <div class="fields"><label>花倍率 g<select id="flower-scale"><option value="1">1 — 大きい花</option><option value="0.7333333333333333">11/15 — 小さい花</option></select></label>
        <label>枝径 mm<select id="branch-diameter"><option value="2.2">2.2</option><option value="2.4">2.4</option></select></label></div>
        <p id="draft-status" class="note"></p>
        <button id="generate" class="primary" disabled>花・内部枝を生成</button>
        <button id="regenerate" disabled>同じ設定で再生成</button>
        <p class="note">枝径だけの変更は花配置を維持。花倍率の変更は花配置と内部枝を更新します。生成には数分かかる場合があります。</p>
        <output id="progress" aria-live="polite">ローカル生成サービスに接続中…</output>
        <p id="error" role="alert" hidden></p>
      </section>
      <section><p class="eyebrow">03 / COMPARE & CHOOSE</p><h2>生成済みの形</h2>
        <p id="generated-status">未生成</p><button id="select-design" disabled>この造形で進める</button><p id="selection-status" class="note">造形の選択のみ。印刷承認ではありません。</p>
        <button id="clear-compare" disabled>左右比較を閉じる</button>
        <div id="candidates" aria-label="不変の生成候補"></div>
      </section>
      <section class="safety"><strong>Support: NOT_GENERATED</strong><br />Print GO: false<p>造形調整のみ。印刷準備は下のR1欄から明示操作。実機への送信は行いません。</p></section>
    </aside>
  </div>
  <footer><span id="build-info"></span><span id="save-status">保存には元形状・設定・生成結果・Undo/Redo履歴を含みます。</span></footer>
</main>`;

function el<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
const flowerScale = el<HTMLSelectElement>("flower-scale");
const diameter = el<HTMLSelectElement>("branch-diameter");
const openInput = el<HTMLInputElement>("open-project");
const version = import.meta.env.VITE_GIT_COMMIT || "unknown";
el("build-info").textContent = `Author Workflow R1 · Updated 2026-10-07 · build ${version}`;
const printUI = createPrintUI();
let view: CreationView | null = null;
try { view = new CreationView(el("viewport")); } catch (error) { showError(error); }
let state: ProjectState | null = null;
let pending = false;
let connected = false;
let generation = 0;
let shownKey = "";
let renderingKey = "";
let pollBusy = false;
let lastCurrent: string | undefined;

function showError(error: unknown): void {
  el("error").textContent = error instanceof Error ? error.message : String(error);
  el("error").hidden = false;
}
function draft(): Recipe { return { flowerScale: Number(flowerScale.value) as Recipe["flowerScale"], diameter: Number(diameter.value) as Recipe["diameter"] }; }
function syncDraft(result?: ResultInfo): void {
  if (result) { flowerScale.value = String(result.recipe.flowerScale); diameter.value = String(result.recipe.diameter); }
}
function isBusy(): boolean { return pending || state?.job?.status === "running"; }

function updateControls(): void {
  const current = currentResult(state);
  const busy = isBusy();
  const locked = busy || !connected;
  for (const id of ["generate", "new-project"]) el<HTMLButtonElement>(id).disabled = locked;
  el<HTMLButtonElement>("regenerate").disabled = locked || !current;
  el<HTMLButtonElement>("undo").disabled = locked || !state || state.cursor <= 0;
  el<HTMLButtonElement>("redo").disabled = locked || !state || state.cursor >= state.history.length - 1;
  el<HTMLButtonElement>("save-project").disabled = locked || !current;
  el<HTMLButtonElement>("select-design").disabled = locked || !current;
  el<HTMLButtonElement>("clear-compare").disabled = locked || !state?.compare;
  openInput.disabled = locked;
  flowerScale.disabled = locked;
  diameter.disabled = locked;
  const changed = current && (current.recipe.flowerScale !== draft().flowerScale || current.recipe.diameter !== draft().diameter);
  el("draft-status").textContent = `${changed ? "未生成の設定" : current ? "表示中と同じ設定" : "これから生成する設定"}：${recipeLabel(draft())}${changed ? "。画面の形はまだ変更していません。" : ""}`;
  el<HTMLButtonElement>("regenerate").disabled ||= Boolean(changed);
  el("history-position").textContent = state?.history.length ? `履歴 ${state.cursor + 1} / ${state.history.length}` : "履歴なし";
  el("generated-status").textContent = current ? `${recipeLabel(current.recipe)} · 花 ${current.flowerCount.toLocaleString()} / 枝 ${current.memberCount.toLocaleString()} · ID ${current.id}` : "未生成";
  const selected = state?.selected && state.results[state.selected];
  el("selection-status").textContent = selected ? `選択済み：${recipeLabel(selected.recipe)} / ${selected.id}。造形の選択のみ。Print GO: false` : "造形の選択のみ。印刷承認ではありません。";
  el("progress").textContent = !connected ? "生成サービスに接続できません。ローカル起動を確認してください。" : pending ? "処理中…" : state?.job?.status === "running" ? `生成中：${state.job.stage}（完了後に形と履歴を一緒に更新）` : state?.job?.status === "failed" ? `生成失敗：${state.job.error ?? state.job.stage}。前の生成結果は保持しています。` : current ? "生成済み・操作できます" : "準備完了：デフォルト形状から生成できます";
  for (const button of el("candidates").querySelectorAll<HTMLButtonElement>("button")) button.disabled = locked;
}

function updateCards(): void {
  const current = currentResult(state);
  const container = el("candidates");
  container.replaceChildren();
  if (!state) return;
  Object.values(state.results).forEach((result, index) => {
    const card = document.createElement("article");
    card.className = "candidate";
    card.dataset.resultId = result.id;
    if (result.id === current?.id) card.classList.add("current");
    const title = document.createElement("h3");
    title.textContent = `${String(index + 1).padStart(2, "0")} · ${recipeLabel(result.recipe)}`;
    const info = document.createElement("p");
    info.textContent = `${result.flowerCount.toLocaleString()} 花 / ${result.memberCount.toLocaleString()} 枝${result.id === current?.id ? " · 表示中" : ""}${result.id === state?.selected ? " · 選択済み" : ""}`;
    const compare = document.createElement("button");
    compare.textContent = result.id === state?.compare ? "右側で比較中" : "この候補と左右比較";
    compare.disabled = isBusy() || !connected;
    compare.addEventListener("click", () => void act(() => mutate("/compare", { id: result.id })));
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "生成識別情報";
    const hashes = document.createElement("p");
    hashes.className = "hashes";
    hashes.textContent = `ID: ${result.id}\nSurface: ${result.surfaceHash}\nCenterlines: ${result.centerlineHash}\nMesh: ${result.meshHash}`;
    details.append(summary, hashes);
    const select = document.createElement("button");
    select.textContent = "この候補を印刷対象に選択";
    select.addEventListener("click", () => void act(() => mutate("/select", { id: result.id })).then(() => {
      const index = (JSON.parse(shownKey || "[]") as string[]).indexOf(result.id);
      if (index >= 0) printUI.capture(result.id, index);
    }));
    card.append(title, info, compare, select, details);
    container.append(card);
  });
}

async function display(): Promise<void> {
  const current = currentResult(state);
  const comparison = state?.compare ? state.results[state.compare] : undefined;
  const ids = current ? [current.id, ...(comparison ? [comparison.id] : [])] : [];
  const key = JSON.stringify(ids);
  if (key === shownKey || key === renderingKey || !view) return;
  renderingKey = key;
  el("empty-view").hidden = false;
  el("empty-view").textContent = current ? "実生成メッシュを読み込み中…" : "mini MOCOMOCO ＋ D6\n右の「花・内部枝を生成」から制作を始めます。";
  // Labels only change when the matching geometry has finished loading.
  try {
    await view.show(ids);
    if (renderingKey !== key) return;
    shownKey = key;
    const labels = el("view-labels");
    labels.replaceChildren();
    for (const [index, result] of [current, comparison].entries()) {
      if (!result) continue;
      const label = document.createElement("div");
      label.textContent = `${index === 0 ? "生成済み / 現在" : "比較候補"} · ${recipeLabel(result.recipe)} · ${result.flowerCount.toLocaleString()} 花`;
      labels.append(label);
    }
    labels.classList.toggle("split", Boolean(comparison));
    el("empty-view").hidden = Boolean(current);
  } catch (error) {
    if (renderingKey === key) { showError(error); el("empty-view").textContent = "メッシュの読込に失敗しました。生成結果は変更していません。"; }
  } finally { if (renderingKey === key) renderingKey = ""; }
}

function applyState(next: ProjectState): void {
  const old = state;
  state = next;
  printUI.update(next);
  connected = true;
  const current = currentResult(state);
  if (current?.id !== lastCurrent) { syncDraft(current); lastCurrent = current?.id; }
  if (!old || JSON.stringify([old.results, old.compare, old.selected, old.cursor, old.history]) !== JSON.stringify([next.results, next.compare, next.selected, next.cursor, next.history])) updateCards();
  updateControls();
  void display();
}

async function act(operation: () => Promise<ProjectState>, clearView = false): Promise<void> {
  if (isBusy() || !connected) return;
  pending = true;
  ++generation;
  el("error").hidden = true;
  updateControls();
  try {
    const next = await operation();
    if (clearView) { view?.clear(); shownKey = ""; renderingKey = ""; lastCurrent = undefined; }
    applyState(next);
  } catch (error) { showError(error); }
  finally { pending = false; updateControls(); }
}

el("generate").addEventListener("click", () => void act(() => mutate("/generate", draft())));
el("regenerate").addEventListener("click", () => void act(() => mutate("/generate", { ...draft(), force: true })));
el("undo").addEventListener("click", () => void act(() => mutate("/undo")));
el("redo").addEventListener("click", () => void act(() => mutate("/redo")));
el("clear-compare").addEventListener("click", () => void act(() => mutate("/compare", { id: null })));
el("select-design").addEventListener("click", () => { const result = currentResult(state); if (result) void act(() => mutate("/select", { id: result.id })).then(() => { if (JSON.parse(shownKey || "[]")[0] === result.id) printUI.capture(result.id); }); });
el("new-project").addEventListener("click", () => {
  if (state?.history.length && !confirm("新しいプロジェクトを開始します。必要な作業は先に .skincreation に保存してください。続けますか？")) return;
  void act(() => mutate("/new"), true);
});
flowerScale.addEventListener("change", updateControls);
diameter.addEventListener("change", updateControls);
el("fit-view").addEventListener("click", () => view?.fit());
for (const kind of ["host", "flowers", "branches"] as const) el<HTMLInputElement>(`show-${kind}`).addEventListener("change", event => view?.setVisibility(kind, (event.target as HTMLInputElement).checked));
openInput.addEventListener("change", () => {
  const file = openInput.files?.[0];
  if (!file) return;
  if (file.size > 512 * 1024 * 1024) { showError("保存ファイルが512 MiBの上限を超えています。"); openInput.value = ""; return; }
  if (state?.history.length && !confirm("現在の作業を保存済みファイルで置き換えます。未保存の変更があれば先に保存してください。開きますか？")) { openInput.value = ""; return; }
  void act(async () => {
    const next = await request<ProjectState>("/open", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
    el("save-status").textContent = `開いた保存：${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MiB`;
    return next;
  }, true).finally(() => { openInput.value = ""; });
});
el("save-project").addEventListener("click", () => {
  if (isBusy() || !connected) return;
  pending = true;
  ++generation;
  updateControls();
  el("error").hidden = true;
  void (async () => {
    try {
      const response = await fetch("/creation-api/save", { cache: "no-store" });
      if (!response.ok) throw new Error(`保存失敗：${response.status} ${await response.text()}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `skin-creation-${new Date().toISOString().replace(/[:.]/g, "-")}.skincreation`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      el("save-status").textContent = `保存データ取得：${(blob.size / 1024 / 1024).toFixed(2)} MiB（ダウンロード先で確認してください）`;
    } catch (error) { showError(error); }
    finally { pending = false; updateControls(); }
  })();
});

async function poll(): Promise<void> {
  if (pending || pollBusy) return;
  const token = generation;
  pollBusy = true;
  try {
    const next = await request<ProjectState>("/state");
    if (token === generation) applyState(next);
  } catch (error) {
    if (token === generation) { connected = false; showError(error); updateControls(); }
  } finally { pollBusy = false; }
}
void poll();
setInterval(() => void poll(), 1000);
