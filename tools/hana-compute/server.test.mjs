import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHanaFinalizationSnapshot } from "../../src/studies/hana/finalizationCore.ts";
import { defaultHanaMaterialSettings } from "../../src/studies/hana/authoringDocument.ts";
import { deriveStroke3D } from "../../src/studies/hana/stroke3d.ts";
import { decodeHanaFinalizationResult } from "../../src/studies/hana/computeProtocol.ts";

const port = 5583;
let child;

function snapshot(requestId = "server-request") {
  const raw = {
    id: "server-gesture",
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: [
      { x: 0, y: 0, pressure: 0.2, time: 0 },
      { x: 2, y: 0.5, pressure: 0.8, time: 20 },
      { x: 4, y: 0, pressure: 0.4, time: 40 },
    ],
  };
  const stroke = deriveStroke3D(raw, (point) => ({ x: point.x, y: 0, z: point.y }), 3);
  return createHanaFinalizationSnapshot({
    requestId,
    documentId: "server-document",
    documentRevision: 1,
    objectRevision: 1,
    generationId: 1,
    stroke,
    materialSettings: defaultHanaMaterialSettings(0.5),
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/hana-compute/v0/health`);
      if (response.ok) return;
    } catch {
      // server is still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("compute server did not start");
}

test.before(async () => {
  child = spawn(process.execPath, ["--experimental-strip-types", "tools/hana-compute/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, HANA_COMPUTE_PORT: String(port), HANA_COMPUTE_WORKERS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();
});

test.after(async () => {
  child.kill();
  await once(child, "exit").catch(() => undefined);
});

test("compute server reports CPU capabilities and returns a binary mesh", async () => {
  const health = await (await fetch(`http://127.0.0.1:${port}/api/hana-compute/v0/health`)).json();
  const capabilities = await (await fetch(`http://127.0.0.1:${port}/api/hana-compute/v0/capabilities`)).json();
  assert.equal(health.status, "ready");
  assert.equal(health.engine, "cpu-js-v0");
  assert.equal(capabilities.gpu, false);
  const source = snapshot();
  const response = await fetch(`http://127.0.0.1:${port}/api/hana-compute/v0/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(source),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-hana-compute-algorithm"), "hana-cpu-js-v0");
  const result = decodeHanaFinalizationResult(await response.arrayBuffer());
  assert.equal(result.requestId, source.requestId);
  assert.equal(result.objectId, source.objectId);
  assert.ok(result.positions.length > 0);
  assert.equal(result.validation.finite, true);
});

test("compute server rejects malformed snapshots before queueing", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/hana-compute/v0/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format: "wrong" }),
  });
  assert.equal(response.status, 400);
});
