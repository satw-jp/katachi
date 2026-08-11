import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { resolve } from "node:path";

const projectRoot = import.meta.dirname;

const publishedStudyPaths = new Map([
  ["tests/hikari/light-drawing/harness.html", "studies/light-drawing/thickness/index.html"],
  ["tests/hikari/light-drawing/source-size-harness.html", "studies/light-drawing/source-size/index.html"],
  ["tests/hikari/light-drawing/stability-harness.html", "studies/light-drawing/stability/index.html"],
  ["tests/hikari/light-drawing/shape-source-reference-harness.html", "studies/light-drawing/shape-source/index.html"],
  ["tests/hikari/light-drawing/shape-gesture-bridge-harness.html", "studies/light-drawing/shape-gesture/index.html"],
]);

function hikariStudyRoutes() {
  return {
    name: "hikari-study-routes",
    enforce: "post" as const,
    configureServer(server: { middlewares: { use(handler: (req: { url?: string }, res: unknown, next: () => void) => void): void } }) {
      server.middlewares.use((req, _res, next) => {
        const pathname = new URL(req.url ?? "/", "http://hikari.local").pathname;
        if (pathname === "/") req.url = "/hikari/";
        else if (pathname === "/studies/light-drawing/thickness/") req.url = "/tests/hikari/light-drawing/harness.html";
        else if (pathname === "/studies/light-drawing/source-size/") req.url = "/tests/hikari/light-drawing/source-size-harness.html";
        else if (pathname === "/studies/light-drawing/stability/") req.url = "/tests/hikari/light-drawing/stability-harness.html";
        else if (pathname === "/studies/light-drawing/shape-source/") req.url = "/tests/hikari/light-drawing/shape-source-reference-harness.html";
        else if (pathname === "/studies/light-drawing/shape-gesture/") req.url = "/tests/hikari/light-drawing/shape-gesture-bridge-harness.html";
        else if (pathname.startsWith("/studies/")) req.url = `/hikari${pathname}`;
        next();
      });
    },
    generateBundle(_options: unknown, bundle: Record<string, { fileName: string }>) {
      for (const [key, output] of Object.entries(bundle)) {
        const normalized = output.fileName.replace(/^\.\//, "");
        const published = publishedStudyPaths.get(normalized)
          ?? (normalized.startsWith("hikari/") ? normalized.slice("hikari/".length) : null);
        if (!published) continue;
        output.fileName = published;
        if (key !== published) {
          bundle[published] = output;
          delete bundle[key];
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: ".",
  base: "/",
  publicDir: false,
  plugins: [hikariStudyRoutes(), ...(mode === "https" ? [basicSsl()] : [])],
  server: {
    port: 5176,
    strictPort: true,
  },
  build: {
    outDir: "dist-hikari",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(projectRoot, "hikari/index.html"),
        "studies/form-points/index": resolve(projectRoot, "hikari/studies/form-points/index.html"),
        "studies/flow-trails/index": resolve(projectRoot, "hikari/studies/flow-trails/index.html"),
        "studies/orbit/index": resolve(projectRoot, "hikari/studies/orbit/index.html"),
        "studies/optical-imprint/index": resolve(projectRoot, "hikari/studies/optical-imprint/index.html"),
        "studies/dissolve-drawing/index": resolve(projectRoot, "hikari/studies/dissolve-drawing/index.html"),
        "studies/light-drawing/thickness/index": resolve(projectRoot, "tests/hikari/light-drawing/harness.html"),
        "studies/light-drawing/source-size/index": resolve(projectRoot, "tests/hikari/light-drawing/source-size-harness.html"),
        "studies/light-drawing/stability/index": resolve(projectRoot, "tests/hikari/light-drawing/stability-harness.html"),
        "studies/light-drawing/shape-source/index": resolve(projectRoot, "tests/hikari/light-drawing/shape-source-reference-harness.html"),
        "studies/light-drawing/shape-gesture/index": resolve(projectRoot, "tests/hikari/light-drawing/shape-gesture-bridge-harness.html"),
      },
    },
  },
}));
