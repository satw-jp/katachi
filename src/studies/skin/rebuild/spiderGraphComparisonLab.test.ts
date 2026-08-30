import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../../../skin-network-lab.html", import.meta.url), "utf8");
const source = readFileSync(new URL("./spiderGraphComparisonLab.ts", import.meta.url), "utf8");
const vite = readFileSync(new URL("../../../../vite.config.ts", import.meta.url), "utf8");
const productionHtml = readFileSync(new URL("../../../../skin-rebuild.html", import.meta.url), "utf8");
const productionMain = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

assert.match(html, /data-skin-app="network-lab"/);
assert.match(html, /spiderGraphComparisonLab\.ts/);
assert.match(source, /data-mode="raw"/);
assert.match(source, /data-mode="clean"/);
assert.match(source, /data-mode="overlay"/);
assert.match(source, /report\.cleanTopology\.edges/);
assert.match(source, /report\.cleanEdgeRealizations/);
assert.match(source, /report\.provenance\.edges/);
assert.match(source, /Collapsed Raw Nodes/);
assert.match(source, /SHADOW ONLY · production geometry unchanged/);
assert.match(source, /buildSkinMesh\(/);
assert.match(source, /null,\s*\n\s*\);/, "the surface context must not include either Raw or Clean Spider geometry");

// The Lab is intentionally reachable from Vite dev by its root HTML but is
// absent from the production multi-page build and from the production UI.
assert.doesNotMatch(vite, /skinNetworkLab|skin-network-lab/);
assert.doesNotMatch(productionHtml, /skin-network-lab|spiderGraphComparisonLab/);
assert.doesNotMatch(productionMain, /spiderGraphComparisonLab|spiderGraphCleanupLab/);

// No Save/export path exists in this comparison surface.
assert.doesNotMatch(source, /exportSkinRebuildStl|encodeBinaryStl|serializeSkinRebuildFkei|captureSkinRebuildFkei|download\(/);
assert.doesNotMatch(source, /buildSkinRebuildLattice|buildSkinRebuildFinalMesh/);

console.log("SKIN NETWORK LAB visual comparison boundary tests passed");
