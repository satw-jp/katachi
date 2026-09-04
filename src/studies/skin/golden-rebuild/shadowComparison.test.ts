import assert from "node:assert/strict";
import {
  createGoldenAdapterRegistry,
  type GoldenAdapterArtifact,
} from "./goldenAdapter.ts";
import { compareArtifactRegistries } from "./shadowComparison.ts";
import { createArtifactRegistry, createRegisteredArtifact } from "./contracts.ts";

const golden = createGoldenAdapterRegistry();
const rebuild = createGoldenAdapterRegistry();
const match = compareArtifactRegistries(golden, rebuild);
assert.equal(match.match, true);
assert.equal(match.differences.length, 0);
assert.equal(match.artifacts.length, 11);

const body = golden.get("body");
assert.ok(body);
const changedBody = createRegisteredArtifact({
  id: body.id,
  data: {
    ...(body.data ?? { summary: "missing" }),
    counts: { ...(body.data?.counts ?? {}), triangles: 1 },
  },
  status: body.status,
  role: body.role,
  provenance: body.provenance,
});
const changed = createArtifactRegistry<GoldenAdapterArtifact>([
  ...rebuild.list().filter((artifact) => artifact.id !== "body"),
  changedBody,
]);
const mismatch = compareArtifactRegistries(golden, changed);
assert.equal(mismatch.match, false);
assert.ok(mismatch.differences.includes("body: fingerprint"));
assert.ok(mismatch.differences.includes("body: counts"));

console.log("golden rebuild shadow comparison passed");
