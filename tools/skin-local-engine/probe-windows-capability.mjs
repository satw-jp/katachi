import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { inspectCompiledEngine } from "./compiled-executable-adapter.mjs";

export const WINDOWS_PROBE_CONTRACT = "katachi.windows-geometry-capability-probe.v1";

function defaultRun(command, args = []) {
  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 2_500,
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
  });
}

export function parseNvidiaSmiSummary(text) {
  const driver = /Driver Version:\s*([\d.]+)/i.exec(text)?.[1] ?? null;
  const cudaRuntimeReported = /CUDA Version:\s*([\d.]+)/i.exec(text)?.[1] ?? null;
  return { driverVersion: driver, cudaRuntimeReported };
}

function commandCapability(run, command, args) {
  const result = run(command, args);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return result.status === 0
    ? { available: true, detail: output.split(/\r?\n/)[0] ?? "available" }
    : { available: false, reasonCode: "command_absent_or_unusable" };
}

export function probeWindowsCapability({
  platform = process.platform,
  run = defaultRun,
  compiledInspection,
} = {}) {
  const windows = platform === "win32";
  const smi = windows ? run("nvidia-smi.exe") : { status: null, stdout: "", stderr: "" };
  const smiSummary = parseNvidiaSmiSummary(String(smi.stdout ?? ""));
  const namesResult = smi.status === 0
    ? run("nvidia-smi.exe", ["--query-gpu=name", "--format=csv,noheader"])
    : { status: null, stdout: "" };
  const deviceNames = namesResult.status === 0
    ? String(namesResult.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];
  const executable = compiledInspection ?? inspectCompiledEngine({ platform });
  const driverAvailable = windows && smi.status === 0 && deviceNames.length > 0;
  const cudaBackendAvailable = driverAvailable && executable.available;
  return {
    contract: WINDOWS_PROBE_CONTRACT,
    platform,
    windows,
    driver: {
      available: driverAvailable,
      driverVersion: smiSummary.driverVersion,
      cudaRuntimeReported: smiSummary.cudaRuntimeReported,
      deviceNames,
    },
    toolchain: {
      nvcc: windows ? commandCapability(run, "nvcc.exe", ["--version"]) : { available: false, reasonCode: "windows_required" },
      cmake: windows ? commandCapability(run, "cmake.exe", ["--version"]) : { available: false, reasonCode: "windows_required" },
      msvc: windows ? commandCapability(run, "cl.exe", []) : { available: false, reasonCode: "windows_required" },
      python: windows ? commandCapability(run, "python.exe", ["--version"]) : { available: false, reasonCode: "windows_required" },
    },
    compiledExecutable: executable,
    cudaBackend: {
      available: cudaBackendAvailable,
      reasonCode: cudaBackendAvailable
        ? null
        : !driverAvailable
          ? "nvidia_driver_or_device_unavailable"
          : executable.reasonCode,
    },
  };
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedAsScript) {
  process.stdout.write(`${JSON.stringify(probeWindowsCapability(), null, 2)}\n`);
}
