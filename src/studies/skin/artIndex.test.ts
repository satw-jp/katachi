import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NETWORK_FORMATION_ARTWORK_ORDER } from "./rebuild/networkFormation.ts";

assert.deepEqual(NETWORK_FORMATION_ARTWORK_ORDER, [
  "trace", "thickness-hierarchy", "multi-seed-confluence", "radial-bloom", "geodesic-signal",
  "hub-cascade", "local-weave", "boundary-frost", "polar-scan", "mirror-stitch",
]);
const source = readFileSync(fileURLToPath(new URL("./artIndex.ts", import.meta.url)), "utf8");
assert.match(source, /FEATURED/);
assert.match(source, /skin-rebuild\.html\?work=/);
assert.match(source, /concepts\//);
assert.match(source, /AUTOPLAY \/ REPLAY \/ INDEX/);
assert.match(source, /COPY LIST/);
assert.match(source, /navigator\.clipboard/);
assert.match(source, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
