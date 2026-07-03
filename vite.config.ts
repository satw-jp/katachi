import { defineConfig } from "vite";

// base: "./" keeps asset paths relative, so the build works on GitHub Pages
// project subpaths, Vercel, Netlify and plain static hosting without changes.
export default defineConfig({
  base: "./",
});
