import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { networkInterfaces } from "node:os";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendPort = parsePort(process.env.HANA_LAN_PORT, 5482);
const computePort = parsePort(process.env.HANA_COMPUTE_PORT, 5483);
const computeWorkers = process.env.HANA_COMPUTE_WORKERS;
const viteBin = resolve(repositoryRoot, "node_modules/vite/bin/vite.js");
const computeServer = resolve(repositoryRoot, "tools/hana-compute/server.mjs");

function parsePort(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid port: ${value ?? fallback}`);
  }
  return port;
}

function privateIpv4Addresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

export function preferredPrivateIpv4() {
  const addresses = privateIpv4Addresses();
  return addresses.find((address) => address.startsWith("192.168."))
    ?? addresses.find((address) => address.startsWith("10."))
    ?? addresses.find((address) => /^172\.(1[6-9]|2\d|3[01])\./.test(address))
    ?? addresses[0]
    ?? "127.0.0.1";
}

async function waitForComputeHealth(port, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/hana-compute/v0/health`);
      if (response.ok) return await response.json();
    } catch {
      // The compute child may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`HANA compute service did not become ready on 127.0.0.1:${port}`);
}

function terminate(child) {
  if (!child || child.killed) return;
  child.kill();
}

export async function startHanaLan() {
  const childEnvironment = {
    ...process.env,
    HANA_COMPUTE_PORT: String(computePort),
  };
  if (computeWorkers !== undefined) childEnvironment.HANA_COMPUTE_WORKERS = computeWorkers;

  const computeChild = spawn(process.execPath, ["--experimental-strip-types", computeServer], {
    cwd: repositoryRoot,
    env: childEnvironment,
    stdio: "inherit",
  });
  const viteChild = spawn(process.execPath, [viteBin, "--mode", "hana-lan"], {
    cwd: repositoryRoot,
    env: {
      ...childEnvironment,
      HANA_LAN_PORT: String(frontendPort),
    },
    stdio: "inherit",
  });

  let stopping = false;
  const stop = (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    terminate(viteChild);
    terminate(computeChild);
    if (exitCode !== null) process.exitCode = exitCode;
  };
  process.once("SIGINT", () => stop(0));
  process.once("SIGTERM", () => stop(0));
  computeChild.once("error", () => stop(1));
  viteChild.once("error", () => stop(1));
  computeChild.once("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
  viteChild.once("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });

  try {
    const health = await waitForComputeHealth(computePort);
    const address = preferredPrivateIpv4();
    console.log(`HANA LAN: http://${address}:${frontendPort}/hana.html`);
    console.log(`HANA LAN (local): http://127.0.0.1:${frontendPort}/hana.html`);
    console.log(`HANA compute: 127.0.0.1:${computePort} · ${health.engine} · workers ${health.workerCount}`);
    console.log("Keep this window open while using the iPad. Press Ctrl+C to stop both services.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    stop(1);
  }

  await new Promise((resolvePromise) => {
    const finish = () => resolvePromise();
    if (viteChild.exitCode !== null || computeChild.exitCode !== null) finish();
    else {
      viteChild.once("exit", finish);
      computeChild.once("exit", finish);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startHanaLan().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
