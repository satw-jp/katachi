#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "src/studies/cloud-sculpt/manifest.json";
const PORT = "5174";

function run(command, args) {
  return execFileSync(command, args, {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(mode, message) {
  const label = mode === "development"
    ? "HIKARI_DEVELOPMENT_GATE_FAILED"
    : "HIKARI_PRODUCTION_GATE_FAILED";
  process.stderr.write(`${label}: ${message}\n`);
  process.exit(2);
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`invalid manifest version ${JSON.stringify(value)}`);
  return match.slice(1).map(Number);
}

function compareVersion(a, b) {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function resolveRef(ref) {
  try {
    return run("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
  } catch (error) {
    throw new Error(`cannot resolve ref ${JSON.stringify(ref)}: ${error.message}`);
  }
}

function resolveDevelopmentCommit(targetRef, resolver = resolveRef) {
  try {
    const commit = resolver(targetRef);
    if (!commit) throw new Error("resolved SHA is empty");
    return commit;
  } catch (error) {
    throw new Error(`target ref ${JSON.stringify(targetRef)} does not exist or cannot resolve: ${error.message}`);
  }
}

function readManifestAtCommit(commit) {
  let manifest;
  try {
    manifest = JSON.parse(run("git", ["show", `${commit}:${MANIFEST}`]));
  } catch (error) {
    throw new Error(`cannot read ${MANIFEST} at ${commit}: ${error.message}`);
  }
  if (typeof manifest.version !== "string") {
    throw new Error(`${MANIFEST} at ${commit} has no version string`);
  }
  return {
    manifest,
    version: manifest.version,
    parsedVersion: parseVersion(manifest.version),
  };
}

function branchCandidates() {
  const text = run("git", [
    "for-each-ref",
    "--format=%(refname:short)%09%(objectname)",
    "refs/heads",
    "refs/remotes/origin",
  ]);
  const byCommit = new Map();
  for (const line of text.split("\n").filter(Boolean)) {
    const [branch, commit] = line.split("\t");
    if (!branch || branch === "origin/HEAD" || !commit) continue;
    let manifest;
    try {
      manifest = JSON.parse(run("git", ["show", `${commit}:${MANIFEST}`]));
    } catch {
      continue;
    }
    if (typeof manifest.version !== "string") continue;
    const previous = byCommit.get(commit);
    byCommit.set(commit, {
      branch: previous?.branch && !previous.branch.startsWith("origin/")
        ? previous.branch
        : branch,
      commit,
      version: manifest.version,
      parsedVersion: parseVersion(manifest.version),
    });
  }
  return [...byCommit.values()];
}

function worktrees() {
  const rows = [];
  let row = {};
  for (const line of `${run("git", ["worktree", "list", "--porcelain"])}\n`.split("\n")) {
    if (!line) {
      if (row.worktree && row.commit) rows.push(row);
      row = {};
    } else if (line.startsWith("worktree ")) row.worktree = line.slice(9);
    else if (line.startsWith("HEAD ")) row.commit = line.slice(5);
    else if (line.startsWith("branch refs/heads/")) row.branch = line.slice(18);
  }
  return rows;
}

function requireSingleWorktree(commit, label, entries = worktrees()) {
  const matches = entries.filter((entry) => entry.commit === commit);
  if (matches.length !== 1) {
    throw new Error(`${label} must have exactly one worktree; found ${matches.length}`);
  }
  return matches[0];
}

function readWorkingManifest(targetWorktree) {
  const path = resolve(targetWorktree.worktree, MANIFEST);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
  if (typeof manifest.version !== "string") {
    throw new Error(`${path} has no version string`);
  }
  return {
    version: manifest.version,
    parsedVersion: parseVersion(manifest.version),
  };
}

function validateWorkingManifestVersion(workingVersion, commitVersion) {
  const workingParsedVersion = parseVersion(workingVersion);
  const commitParsedVersion = parseVersion(commitVersion);
  if (compareVersion(workingParsedVersion, commitParsedVersion) < 0) {
    throw new Error(`worktree manifest regressed to ${workingVersion}; commit version is ${commitVersion}`);
  }
  return workingVersion !== commitVersion;
}

function readRuntimeListener() {
  let pid;
  try {
    pid = run("lsof", [`-tiTCP:${PORT}`, "-sTCP:LISTEN"]);
  } catch {
    throw new Error(`nothing is listening on port ${PORT}`);
  }
  if (!/^\d+$/.test(pid)) {
    throw new Error(`expected one listener on port ${PORT}; got ${JSON.stringify(pid)}`);
  }
  let cwd;
  try {
    const cwdLine = run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"])
      .split("\n")
      .find((line) => line.startsWith("n"));
    cwd = cwdLine?.slice(1);
  } catch (error) {
    throw new Error(`cannot inspect listener ${pid}: ${error.message}`);
  }
  if (!cwd) throw new Error(`cannot determine listener cwd for pid ${pid}`);
  return { pid, cwd };
}

function validateRuntimeCwd(targetWorktree, probe = readRuntimeListener) {
  const observed = probe();
  const cwd = typeof observed === "string" ? observed : observed.cwd;
  if (!cwd) throw new Error("runtime listener cwd is unavailable");
  if (resolve(cwd || "") !== resolve(targetWorktree)) {
    throw new Error(`runtime listener cwd ${cwd || "unknown"} does not match target worktree ${targetWorktree}`);
  }
  if (typeof observed === "string") return `cwd=${cwd}`;
  return `pid=${observed.pid} cwd=${cwd}`;
}

function verifyTarget({ mode, commit, commitManifest, runtimeRequired, worktreeEntries }) {
  const targetWorktree = requireSingleWorktree(commit, `${mode} commit ${commit}`, worktreeEntries);
  const workingManifest = readWorkingManifest(targetWorktree);
  const workingManifestChanged = validateWorkingManifestVersion(
    workingManifest.version,
    commitManifest.version,
  );
  const runtime = runtimeRequired
    ? validateRuntimeCwd(targetWorktree.worktree)
    : "not-running";
  return { targetWorktree, workingManifestChanged, runtime };
}

function formatCandidates(candidates) {
  if (candidates.length === 0) return "none";
  return candidates
    .map((candidate) => `${candidate.branch}@${candidate.commit.slice(0, 8)}:${candidate.version}`)
    .join(",");
}

function selectProductionTarget(mainCommit, mainManifest, candidates) {
  const mainCandidate = candidates.find((candidate) => candidate.commit === mainCommit);
  if (!mainCandidate) {
    throw new Error(`origin/main commit ${mainCommit} is not present in the scanned refs`);
  }
  const higherVersionCandidates = candidates.filter((candidate) =>
    compareVersion(candidate.parsedVersion, mainManifest.parsedVersion) > 0);
  const sameVersionNonMainCandidates = candidates.filter((candidate) =>
    candidate.commit !== mainCommit &&
    compareVersion(candidate.parsedVersion, mainManifest.parsedVersion) === 0);
  return { mainCandidate, higherVersionCandidates, sameVersionNonMainCandidates };
}

function runProductionGate(runtimeRequired) {
  const mainCommit = resolveRef("origin/main");
  const mainManifest = readManifestAtCommit(mainCommit);
  const selection = selectProductionTarget(mainCommit, mainManifest, branchCandidates());
  const verification = verifyTarget({
    mode: "production origin/main",
    commit: mainCommit,
    commitManifest: mainManifest,
    runtimeRequired,
  });
  process.stdout.write([
    "HIKARI_PRODUCTION_GATE_OK",
    "mode=production",
    "productionRef=origin/main",
    `version=${mainManifest.version}`,
    `commit=${mainCommit}`,
    `worktree=${verification.targetWorktree.worktree}`,
    `worktreeBranch=${verification.targetWorktree.branch || "detached"}`,
    `workingManifestChanged=${verification.workingManifestChanged}`,
    `higherVersionBranches=${formatCandidates(selection.higherVersionCandidates)}`,
    `sameVersionNonMainBranches=${formatCandidates(selection.sameVersionNonMainCandidates)}`,
    `runtime=${verification.runtime}`,
  ].join("\n") + "\n");
}

function runDevelopmentGate(targetRef, runtimeRequired) {
  const commit = resolveDevelopmentCommit(targetRef);
  const commitManifest = readManifestAtCommit(commit);
  const verification = verifyTarget({
    mode: `development target ${targetRef}`,
    commit,
    commitManifest,
    runtimeRequired,
  });
  process.stdout.write([
    "HIKARI_DEVELOPMENT_GATE_OK",
    "mode=development",
    `target=${targetRef}`,
    `commit=${commit}`,
    `version=${commitManifest.version}`,
    `worktree=${verification.targetWorktree.worktree}`,
    `worktreeBranch=${verification.targetWorktree.branch || "detached"}`,
    `workingManifestChanged=${verification.workingManifestChanged}`,
    `runtime=${verification.runtime}`,
  ].join("\n") + "\n");
}

function parseArgs(args) {
  const runtimeRequired = args.includes("--runtime");
  const productionRequested = args.includes("--production");
  let targetRef;
  const unknown = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--runtime" || arg === "--production") continue;
    if (arg === "--target") {
      targetRef = args[++index];
      if (!targetRef || targetRef.startsWith("--")) {
        throw new Error("--target requires a ref or commit SHA");
      }
      continue;
    }
    if (arg.startsWith("--target=")) {
      targetRef = arg.slice("--target=".length);
      if (!targetRef || targetRef.startsWith("--")) {
        throw new Error("--target requires a ref or commit SHA");
      }
      continue;
    }
    unknown.push(arg);
  }
  if (unknown.length > 0) throw new Error(`unknown argument ${unknown.join(", ")}`);
  if (productionRequested && targetRef) {
    throw new Error("--production cannot be combined with --target");
  }
  return { targetRef, runtimeRequired };
}

function runSelectionSelfTest() {
  const candidate = (branch, commit, version) => ({
    branch,
    commit,
    version,
    parsedVersion: parseVersion(version),
  });
  const mainManifest = { version: "0.32.1", parsedVersion: parseVersion("0.32.1") };
  const main = candidate("main", "main-sha", "0.32.1");
  const docs = candidate("docs", "docs-sha", "0.32.1");
  const integration = candidate("integration", "integration-sha", "0.32.1");

  const parallel = selectProductionTarget("main-sha", mainManifest, [main, docs, integration]);
  assert.equal(parallel.mainCandidate.commit, "main-sha");
  assert.deepEqual(parallel.higherVersionCandidates, []);
  assert.deepEqual(parallel.sameVersionNonMainCandidates, [docs, integration]);

  const singleTopic = selectProductionTarget("main-sha", mainManifest, [main, integration]);
  assert.equal(singleTopic.mainCandidate.commit, "main-sha");

  const higher = candidate("next", "next-sha", "0.33.0");
  const higherReport = selectProductionTarget("main-sha", mainManifest, [main, higher]);
  assert.equal(higherReport.mainCandidate.commit, "main-sha");
  assert.match(formatCandidates(higherReport.higherVersionCandidates), /next@next-sha:0\.33\.0/);

  const resolver = (ref) => {
    if (ref === "integration") return "integration-sha";
    throw new Error("missing ref");
  };
  assert.equal(resolveDevelopmentCommit("integration", resolver), "integration-sha");
  assert.throws(() => resolveDevelopmentCommit("missing", resolver), /target ref/);

  const targetWorktree = { worktree: "C:/work/target", commit: "target-sha" };
  assert.throws(() => requireSingleWorktree("target-sha", "development", []), /found 0/);
  assert.throws(() => requireSingleWorktree("target-sha", "development", [targetWorktree, targetWorktree]), /found 2/);
  assert.equal(requireSingleWorktree("target-sha", "development", [targetWorktree]), targetWorktree);

  assert.throws(() => validateWorkingManifestVersion("0.32.0", "0.32.1"), /regressed/);
  assert.equal(validateWorkingManifestVersion("0.32.1", "0.32.1"), false);
  assert.equal(validateWorkingManifestVersion("0.33.0", "0.32.1"), true);

  assert.throws(
    () => validateRuntimeCwd("C:/work/target", () => ({ pid: "1", cwd: "C:/work/other" })),
    /does not match/,
  );
  assert.equal(
    validateRuntimeCwd("C:/work/target", () => ({ pid: "1", cwd: "C:/work/target" })),
    "pid=1 cwd=C:/work/target",
  );
}

if (process.argv.includes("--self-test")) {
  try {
    runSelectionSelfTest();
    process.stdout.write("HIKARI_VERSION_GATE_SELF_TEST_OK\n");
    process.exit(0);
  } catch (error) {
    fail("production", `self-test failed: ${error.message}`);
  }
}

let cli;
try {
  cli = parseArgs(process.argv.slice(2));
} catch (error) {
  fail("production", error.message);
}

const mode = cli.targetRef ? "development" : "production";
try {
  if (cli.targetRef) runDevelopmentGate(cli.targetRef, cli.runtimeRequired);
  else runProductionGate(cli.runtimeRequired);
} catch (error) {
  fail(mode, error.message);
}
