#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "src/studies/cloud-sculpt/manifest.json";
const PORT = "5174";
const runtimeRequired = process.argv.includes("--runtime");

function run(command, args) {
  return execFileSync(command, args, {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(message) {
  process.stderr.write(`HIKARI_VERSION_GATE_FAILED: ${message}\n`);
  process.exit(2);
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) fail(`invalid manifest version ${JSON.stringify(value)}`);
  return match.slice(1).map(Number);
}

function compareVersion(a, b) {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: REPO,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
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

/**
 * Selects the highest manifest version without allowing stale, divergent
 * same-version topic refs to obscure accepted trunk. A higher divergent
 * version remains deliberately visible and therefore still blocks selection.
 */
function selectCurrent(candidates, mainCommit, ancestor = isAncestor) {
  candidates.sort((a, b) => compareVersion(b.parsedVersion, a.parsedVersion));
  const highestVersion = candidates[0].version;
  let highest = candidates.filter((candidate) => candidate.version === highestVersion);
  const mainCandidate = mainCommit
    ? candidates.find((candidate) => candidate.commit === mainCommit)
    : undefined;
  if (mainCandidate?.version === highestVersion) {
    highest = highest.filter((candidate) =>
      ancestor(candidate.commit, mainCommit) || ancestor(mainCommit, candidate.commit));
  }
  let selected = highest[0];
  if (highest.length > 1) {
    const descendants = highest.filter((candidate) => highest.every((other) =>
      candidate.commit === other.commit || ancestor(other.commit, candidate.commit)));
    if (descendants.length !== 1) {
      throw new Error(`version ${highestVersion} exists on divergent commits: ${highest.map((item) => `${item.branch}@${item.commit.slice(0, 8)}`).join(", ")}`);
    }
    [selected] = descendants;
  }
  return { highestVersion, selected };
}

function runSelectionSelfTest() {
  const candidate = (branch, commit, version) => ({
    branch, commit, version, parsedVersion: parseVersion(version),
  });
  const assertSelected = (actual, expected, label) => {
    if (actual.selected.commit !== expected) {
      throw new Error(`${label}: expected ${expected}, got ${actual.selected.commit}`);
    }
  };
  const trunkRelations = new Set(["old>main"]);
  const trunkAncestor = (ancestor, descendant) =>
    ancestor === descendant || trunkRelations.has(`${ancestor}>${descendant}`);
  assertSelected(selectCurrent([
    candidate("origin/main", "main", "0.32.1"),
    candidate("old", "old", "0.32.1"),
    candidate("draft", "draft", "0.32.1"),
  ], "main", trunkAncestor), "main", "same-version divergent draft filtering");
  assertSelected(selectCurrent([
    candidate("origin/main", "main", "0.32.1"),
    candidate("next", "next", "0.33.0"),
  ], "main", trunkAncestor), "next", "higher divergent version remains visible");
  const descendantRelations = new Set(["main>a", "main>b"]);
  const descendantAncestor = (ancestor, descendant) =>
    ancestor === descendant || descendantRelations.has(`${ancestor}>${descendant}`);
  let rejected = false;
  try {
    selectCurrent([
      candidate("origin/main", "main", "0.32.1"),
      candidate("feature-a", "a", "0.32.1"),
      candidate("feature-b", "b", "0.32.1"),
    ], "main", descendantAncestor);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("incomparable post-main heads must fail");
}

if (process.argv.includes("--self-test")) {
  runSelectionSelfTest();
  process.stdout.write("HIKARI_VERSION_GATE_SELF_TEST_OK\\n");
  process.exit(0);
}

const candidates = branchCandidates();
if (candidates.length === 0) fail(`no branch contains ${MANIFEST}`);
let mainCommit;
try {
  mainCommit = run("git", ["rev-parse", "origin/main"]);
} catch {
  mainCommit = undefined;
}
let selected;
try {
  ({ selected } = selectCurrent(candidates, mainCommit));
} catch (error) {
  fail(error.message);
}

const matchingWorktrees = worktrees().filter((worktree) => worktree.commit === selected.commit);
if (matchingWorktrees.length !== 1) {
  fail(`latest ${selected.version} (${selected.branch}@${selected.commit.slice(0, 8)}) must have exactly one worktree; found ${matchingWorktrees.length}`);
}
const target = matchingWorktrees[0];
const workingManifestPath = resolve(target.worktree, MANIFEST);
let workingVersion;
try {
  workingVersion = JSON.parse(readFileSync(workingManifestPath, "utf8")).version;
} catch (error) {
  fail(`cannot read ${workingManifestPath}: ${error.message}`);
}
const workingParsedVersion = parseVersion(workingVersion);
if (compareVersion(workingParsedVersion, selected.parsedVersion) < 0) {
  fail(`worktree manifest regressed to ${workingVersion}; branch commit is ${selected.version}`);
}
const workingManifestChanged = workingVersion !== selected.version;

let runtime = "not-running";
if (runtimeRequired) {
  let pid;
  try {
    pid = run("lsof", [`-tiTCP:${PORT}`, "-sTCP:LISTEN"]);
  } catch {
    fail(`nothing is listening on port ${PORT}`);
  }
  if (!/^\d+$/.test(pid)) fail(`expected one listener on port ${PORT}; got ${JSON.stringify(pid)}`);
  let cwd;
  try {
    const cwdLine = run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"])
      .split("\n")
      .find((line) => line.startsWith("n"));
    cwd = cwdLine?.slice(1);
  } catch (error) {
    fail(`cannot inspect listener ${pid}: ${error.message}`);
  }
  if (resolve(cwd || "") !== resolve(target.worktree)) {
    fail(`port ${PORT} serves ${cwd || "unknown"}; current Hikari is ${target.worktree}`);
  }
  runtime = `pid=${pid} cwd=${cwd}`;
}

process.stdout.write([
  "HIKARI_VERSION_GATE_OK",
  `version=${workingVersion}`,
  `commitVersion=${selected.version}`,
  `workingManifestChanged=${workingManifestChanged}`,
  `branch=${target.branch || selected.branch}`,
  `commit=${selected.commit}`,
  `worktree=${target.worktree}`,
  `runtime=${runtime}`,
].join("\n") + "\n");
