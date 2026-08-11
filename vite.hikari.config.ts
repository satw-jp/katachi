import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ mode }) => ({
  root: "hikari",
  base: "./",
  publicDir: false,
  plugins: mode === "https" ? [basicSsl()] : [],
  server: {
    port: 5176,
    strictPort: true,
  },
  build: {
    outDir: "../dist-hikari",
    emptyOutDir: true,
  },
}));
