// ---------------------------------------------------------------------------
// Library — SHA-256 hex digest.
//
// 昇格の経緯 (Optimizer/docs/sonnet-instruction-20260726-katachi-r1-r2-library-
// first-extraction.md §4): この関数は 2 Study に同じ内容で二重に存在していた。
//
//   - src/studies/skin/main.ts            (private, ArrayBuffer | string)
//   - src/studies/interior-growth/meshExport.ts (export, ArrayBuffer)
//
// どちらも Web Crypto の `crypto.subtle.digest("SHA-256", bytes)` を呼び、
// 結果を lowercase 64 文字 hex にするだけで、差は「文字列入力を受けるか」
// だけだった。R0 の重複調査（docs/architecture/katachi-dependency-duplication-
// map-20260725.md）で Library 昇格候補の最小例として挙がり、Q1（`src/lib` を
// 正式 Library とする）の作者承認を受けて最初の昇格対象になった。
//
// なぜ最初がこれなのか: 依存 Study 数がより多い候補（`vertexShader` は 7 Study）
// もあるが、この関数は既存の自動テストで検証でき、実画面の目視確認が 2 画面で
// 済む。「小さく戻せる」ことを規模より優先した（reorganization plan R2）。
//
// 依存は増やさない。Web Crypto のみで、Node 専用 API は使わない。
// ---------------------------------------------------------------------------

/**
 * `data` の SHA-256 を lowercase 64 文字の hex 文字列で返す。
 *
 * `string` を受ける形は削れない: S-skin は保存する STL の bytes だけでなく、
 * 読み込んだ recipe の**テキスト**も hash して来歴に残している
 * (`importedRecipeSha256`)。文字列は UTF-8 bytes へ変換してから digest する
 * （`TextEncoder` の既定が UTF-8。移行前の skin 実装と同じ振る舞い）。
 *
 * 返り値は常に 64 文字。`toString(16)` は 0x0f のような値を 1 文字で返すため、
 * `padStart(2, "0")` が無いと長さが揺れる — 移行前の 2 実装と同じ処理を保つ。
 */
export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
