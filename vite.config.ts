import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cwd } from "node:process";

function phase5RabbitSourcePlugin() {
  return {
    name: "phase5-rabbit-source",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use: (path: string, handler: (request: unknown, response: { statusCode: number; setHeader(name: string, value: string): void; end(body: Uint8Array): void }, next: () => void) => void) => void } }) {
      server.middlewares.use("/__phase5/rabbit_230223.stl", (_request, response, next) => {
        try {
          const bytes = readFileSync("C:/dev/samples/rabbit_230223.stl");
          response.statusCode = 200;
          response.setHeader("Content-Type", "model/stl");
          response.setHeader("Cache-Control", "no-store");
          response.end(bytes);
        } catch {
          next();
        }
      });
    },
  };
}

function exactRunningCommit(): string {
  // Codex may build a workspace owned by its sandbox account from the signed-
  // in desktop account. Scope Git's ownership exception to this one command
  // and this exact checkout instead of mutating the user's global config.
  const repository = cwd().replace(/\\/g, "/");
  const commit = execFileSync("git", ["-c", `safe.directory=${repository}`, "rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("Cannot resolve exact generator commit SHA");
  return commit;
}

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
  define: {
    "import.meta.env.VITE_GIT_COMMIT": JSON.stringify(exactRunningCommit()),
  },
  plugins: [
    ...(mode === "https" ? [basicSsl()] : []),
    phase5RabbitSourcePlugin(),
  ],
  server: {
    // Katachi は常に 5174。docs/launcher-spec.md のポート台帳で一意に固定。
    // Morpho(5173)・Yomu(5175) と衝突させない。strictPort で別ポートに逃げない。
    port: 5174,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      // Multi-page build: S1 (cloud-sculpt.html) と S2 (gravity.html) は素朴なリンクで
      // 行き来する別々の Study なので、どちらも static build の出力に含める。
      // Paths are relative to vite's root (project root, process.cwd() by
      // default) — avoids pulling in @types/node just for path resolution.
      input: {
        // root は Hikari の入口。同じ実装を共有する Cloud Sculpt は、Study一覧から
        // `cloud-sculpt.html` へ入ることで初期表示を KATACHI に固定する。
        main: "index.html",
        cloudSculpt: "cloud-sculpt.html",
        // R5: Study launcher（Instrument の最初の一枚）。
        studies: "studies.html",
        gravity: "gravity.html",
        sag: "sag.html",
        mpm: "mpm.html",
        foam: "foam.html",
        rings: "rings.html",
        pack: "pack.html",
        skin: "skin.html",
        skinRebuild: "skin-rebuild.html",
        interiorGrowth: "interior-growth.html",
        hitsuji: "hitsuji.html",
        hitsujiField: "hitsuji-field.html",
        tangle: "tangle.html",
        externalStlHostLab: "skin-external-stl-host-lab.html",
        externalStlHostV6: "skin-external-stl-host-v6.html",
        flowerPackingSpike: "flower-packing-spike.html",
        flowerFormSpike: "flower-form-spike.html",
        flowerCoreNetwork: "flower-core-network.html",
      },
    },
  },
}));
