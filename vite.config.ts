import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// base: "./" keeps asset paths relative, so the build works on GitHub Pages
// project subpaths, Vercel, Netlify and plain static hosting without changes.
//
// `--mode https` → 自己署名証明書の HTTPS 開発サーバー。
// 理由: WebGPU はセキュアコンテキスト（localhost か HTTPS）必須。別 PC から
// http://192.168.x.x で開くと navigator.gpu が存在せず MPM が CPU に落ちる
// （2026-07-10 作者の Windows/RTX3080 で実害。ブラウザフラグ回避は不安定だった）。
// 「Katachi を別のPCから見る.command」が `--mode https` を渡す。普段の localhost は素の HTTP のまま。
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "https" ? [basicSsl()] : [],
  server: {
    // Katachi は常に 5174。docs/launcher-spec.md のポート台帳で一意に固定。
    // Morpho(5173)・Yomu(5175) と衝突させない。strictPort で別ポートに逃げない。
    port: 5174,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      // Multi-page build: S1 (index.html) と S2 (gravity.html) は素朴なリンクで
      // 行き来する別々の Study なので、どちらも static build の出力に含める。
      // Paths are relative to vite's root (project root, process.cwd() by
      // default) — avoids pulling in @types/node just for path resolution.
      input: {
        main: "index.html",
        gravity: "gravity.html",
        sag: "sag.html",
        mpm: "mpm.html",
        foam: "foam.html",
        rings: "rings.html",
        pack: "pack.html",
        skin: "skin.html",
      },
    },
  },
}));
