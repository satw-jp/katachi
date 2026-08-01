#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = "/Users/atsushisato/Projects/active/Katachi";
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

const candidates = branchCandidates();
if (candidates.length === 0) fail(`no branch contains ${MANIFEST}`);
candidates.sort((a, b) => compareVersion(b.parsedVersion, a.parsedVersion));
const highestVersion = candidates[0].version;
const highest = candidates.filter((candidate) => candidate.version === highestVersion);

let selected = highest[0];
if (highest.length > 1) {
  const descendants = highest.filter((candidate) => highest.every((other) => {
    if (candidate.commit === other.commit) return true;
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", other.commit, candidate.commit], {
        cwd: REPO,
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  }));
  if (descendants.length !== 1) {
    fail(`version ${highestVersion} exists on divergent commits: ${highest.map((item) => `${item.branch}@${item.commit.slice(0, 8)}`).join(", ")}`);
  }
  [selected] = descendants;
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
