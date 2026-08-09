import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { Ld2Case, Ld2Run } from "../../../src/studies/cloud-sculpt/lightDrawing/ld2SourceSize.ts";
import {
  LD2_STABILITY_PANEL_ORDER,
  LD2_STABILITY_RUN_ROLES,
  createLd2SourceSizeStabilityBundle,
} from "./source-size-stability.ts";
import { deriveLd2ReadinessCopy, failureColumnExplanation, LD2_RADIUS2_NEGATIVE_EVIDENCE_CODES, mapRadius2NegativeEvidence } from "./stability-harness.ts";

function fakeCase(diameterDegrees: number): Ld2Case {
  return { diameterDegrees } as Ld2Case;
}

function fakeRun(sampleCount: number, estimator: "primary" | "audit"): Ld2Run {
  return { sampleCount, estimator, cases: [fakeCase(.53), fakeCase(5), fakeCase(20)] };
}

/** Reads a CSS braced block without mistaking nested declaration blocks for its end. */
function cssBracedBlock(css: string, openingBrace: number): { body: string; end: number } {
  let depth = 0; let quote: "'" | "\"" | null = null; let comment = false;
  for (let index = openingBrace; index < css.length; index++) {
    const character = css[index]; const next = css[index + 1];
    if (comment) { if (character === "*" && next === "/") { comment = false; index++; } continue; }
    if (quote) { if (character === "\\") { index++; continue; } if (character === quote) quote = null; continue; }
    if (character === "/" && next === "*") { comment = true; index++; continue; }
    if (character === "'" || character === "\"") { quote = character; continue; }
    if (character === "{") depth++;
    if (character === "}" && --depth === 0) return { body: css.slice(openingBrace + 1, index), end: index + 1 };
  }
  throw new Error("unclosed CSS block");
}

/** Finds #panels grid-column overrides inside whole @media blocks, brace-aware. */
function hasMediaPanelColumnOverride(css: string): boolean {
  const media = /@media\b[^{}]*\{/g;
  for (let match = media.exec(css); match; match = media.exec(css)) {
    const mediaBlock = cssBracedBlock(css, media.lastIndex - 1);
    media.lastIndex = mediaBlock.end;
    const panels = /#panels\s*\{/g;
    for (let panel = panels.exec(mediaBlock.body); panel; panel = panels.exec(mediaBlock.body)) {
      const panelBlock = cssBracedBlock(mediaBlock.body, panels.lastIndex - 1);
      panels.lastIndex = panelBlock.end;
      if (/\bgrid-template-columns\s*:/.test(panelBlock.body)) return true;
    }
  }
  return false;
}

test("stability bundle freezes four roles, one active evaluation, and pure max-texel evidence replays", () => {
  assert.ok(Object.isFrozen(LD2_STABILITY_RUN_ROLES));
  assert.deepEqual(LD2_STABILITY_RUN_ROLES.map(({ id, sampleCount, estimator }) => [id, sampleCount, estimator]), [
    ["primary16", 16384, "primary"], ["primary32", 32768, "primary"], ["audit16", 16384, "audit"], ["audit32", 32768, "audit"],
  ]);
  assert.ok(Object.isFrozen(LD2_STABILITY_PANEL_ORDER));
  assert.deepEqual(LD2_STABILITY_PANEL_ORDER.map(({ diameterDegrees, runId }) => [diameterDegrees, runId]), [
    [5, "primary16"], [5, "primary32"], [5, "audit32"], [20, "primary16"], [20, "primary32"], [20, "audit32"],
  ]);

  const calls: Array<[number, string]> = [];
  const primary16 = fakeRun(16384, "primary"); const primary32 = fakeRun(32768, "primary");
  const audit16 = fakeRun(16384, "audit"); const audit32 = fakeRun(32768, "audit");
  const lookup = new Map<string, Ld2Run>([["16384:primary", primary16], ["32768:primary", primary32], ["16384:audit", audit16], ["32768:audit", audit32]]);
  const evaluation = { qualified: false, failures: [{ code: "frozen", message: "evidence", actual: 1, threshold: .05 }] };
  const maxTexelEvidence = { qualified: false, failures: [{ code: "max-texel", message: "evidence", actual: 3, threshold: .05 }] };
  const radius2Evidence = { qualified: false, failures: [{ code: "radius2", message: "evidence", actual: 2, threshold: .05 }] };
  let evaluatorCalls = 0;
  let maxTexelCalls = 0;
  const bundle = createLd2SourceSizeStabilityBundle((sampleCount, estimator) => {
    calls.push([sampleCount, estimator]);
    return lookup.get(`${sampleCount}:${estimator}`)!;
  }, (a, b, c, d) => {
    evaluatorCalls++;
    assert.strictEqual(a, primary16); assert.strictEqual(b, primary32); assert.strictEqual(c, audit16); assert.strictEqual(d, audit32);
    return evaluation;
  }, (run) => run, (a, b, c, d) => {
    assert.strictEqual(a, primary16); assert.strictEqual(b, primary32); assert.strictEqual(c, audit16); assert.strictEqual(d, audit32);
    return maxTexelCalls++ === 0 ? maxTexelEvidence : radius2Evidence;
  });

  assert.deepEqual(calls, [[16384, "primary"], [32768, "primary"], [16384, "audit"], [32768, "audit"]]);
  assert.equal(evaluatorCalls, 1);
  assert.equal(maxTexelCalls, 2);
  assert.strictEqual(bundle.gates, evaluation);
  assert.strictEqual(bundle.radius8MaxTexelNegativeEvidence, maxTexelEvidence);
  assert.strictEqual(bundle.radius2NegativeEvidence, radius2Evidence);
  assert.ok(Object.isFrozen(bundle)); assert.ok(Object.isFrozen(bundle.runs)); assert.ok(Object.isFrozen(bundle.panels)); assert.ok(Object.isFrozen(bundle.gates)); assert.ok(Object.isFrozen(bundle.gates.failures)); assert.ok(Object.isFrozen(bundle.radius8MaxTexelNegativeEvidence)); assert.ok(Object.isFrozen(bundle.radius8MaxTexelNegativeEvidence.failures)); assert.ok(Object.isFrozen(bundle.radius2NegativeEvidence)); assert.ok(Object.isFrozen(bundle.radius2NegativeEvidence.failures));
  assert.deepEqual(bundle.panels.map(({ diameterDegrees, runId }) => [diameterDegrees, runId]), [
    [5, "primary16"], [5, "primary32"], [5, "audit32"], [20, "primary16"], [20, "primary32"], [20, "audit32"],
  ]);
  assert.strictEqual(bundle.panels[0].item, primary16.cases[1]);
  assert.strictEqual(bundle.panels[5].item, audit32.cases[2]);
});

test("the fixed bundle retains complete radius-8 fields/configs, qualifying local gates, and exact max-texel/radius-2 evidence", () => {
  const bundle = createLd2SourceSizeStabilityBundle();
  assert.equal(bundle.panels.length, 6);
  for (const panel of bundle.panels) {
    const source = bundle.runs[panel.runId].cases.find((item) => item.diameterDegrees === panel.diameterDegrees)!;
    assert.strictEqual(panel.item.result.on.reconstructedField, source.result.on.reconstructedField);
    assert.strictEqual(panel.item.qualificationField, source.qualificationField);
    assert.strictEqual(panel.item.result.config, source.result.config);
    assert.equal(panel.item.qualificationField.width, 512);
    assert.equal(panel.item.qualificationField.height, 512);
    assert.equal(panel.item.qualificationField.minU, -1.4);
    assert.equal(panel.item.qualificationField.minV, -1.4);
    assert.equal(panel.item.qualificationField.sizeU, 2.8);
    assert.equal(panel.item.qualificationField.sizeV, 2.8);
    assert.equal(panel.item.result.config.displayScale, 9);
    assert.equal(panel.item.result.config.exposure, 1);
  }
  const expected = [
    ["primary:5:max-texel-concentration-convergence", .06958298424832433],
    ["primary:5:effective-area-convergence", .06376472725673475],
    ["primary:20:max-texel-concentration-convergence", .36140647413220367],
    ["primary:20:effective-area-convergence", .10746259656889985],
    ["audit:5:max-texel-concentration-convergence", .06480383469980763],
    ["audit:5:effective-area-convergence", .0576548398129195],
    ["audit:20:max-texel-concentration-convergence", .23347356934817168],
    ["audit:20:effective-area-convergence", .09945447939925521],
  ] as const;
  assert.equal(bundle.gates.qualified, true);
  assert.deepEqual(bundle.gates.failures, []);
  assert.deepEqual(bundle.radius8MaxTexelNegativeEvidence.failures.map(({ code, actual }) => [code, actual]), [
    ["primary:20:max-texel-concentration-convergence", .15190913729312328],
    ["primary-audit:20:max-texel-concentration-discrepancy", .07365026383968129],
  ]);
  assert.equal(failureColumnExplanation(bundle.radius8MaxTexelNegativeEvidence.failures[0].code), "primary16 ↔ primary32: row の first ↔ middle column");
  assert.equal(failureColumnExplanation(bundle.radius8MaxTexelNegativeEvidence.failures[1].code), "primary32 ↔ audit32: visual independent-estimator comparison");
  assert.equal(bundle.radius2NegativeEvidence.qualified, false);
  assert.equal(bundle.radius2NegativeEvidence.failures.length, expected.length);
  assert.deepEqual(LD2_RADIUS2_NEGATIVE_EVIDENCE_CODES, expected.map(([code]) => code));
  const mappedRadius2Evidence = mapRadius2NegativeEvidence(bundle.radius2NegativeEvidence.failures);
  assert.equal(mappedRadius2Evidence.length, 8, "runtime evidence mapping must not prevent the six-panel bundle from rendering");
  assert.deepEqual(mappedRadius2Evidence.map(({ code }) => code), expected.map(([code]) => code));
  assert.equal(failureColumnExplanation(mappedRadius2Evidence.find(({ code }) => code.startsWith("audit:"))!.code), "audit16 ↔ audit32: quantitative-only; audit16 is not rendered");
  for (const [index, [code, actual]] of expected.entries()) {
    const failure = bundle.radius2NegativeEvidence.failures[index];
    assert.equal(failure.code, code); assert.equal(failure.actual, actual); assert.equal(failure.threshold, .05);
  }
});

test("readiness status and footer are derived only after gate evaluation for both outcomes", () => {
  assert.deepEqual(deriveLd2ReadinessCopy({ qualified: true, failures: [] }), {
    className: "qualified-status",
    status: "LOCAL CPU READINESS: QUALIFIED",
    footer: "LOCAL CPU READINESS: QUALIFIED。FORMAL OPT-LD-2 HAS NOT STARTED。NOT PRODUCTION。これは local CPU verification であり、formal GO または acceptance ではありません。",
  });
  const failed = deriveLd2ReadinessCopy({ qualified: true, failures: [{ code: "must-not-qualify", message: "failure", actual: 1, threshold: .05 }] });
  assert.equal(failed.className, "failed-status");
  assert.match(failed.status, /FAILED \/ NOT QUALIFIED \(1 failures\)/);
  assert.match(failed.footer, /FORMAL OPT-LD-2 HAS NOT STARTED/);
});

test("diagnostic page keeps six equally-scaled full-frame fields and persistent non-acceptance copy", async () => {
  const [html, css, source] = await Promise.all([
    readFile(new URL("./stability-harness.html", import.meta.url), "utf8"),
    readFile(new URL("./stability-harness.css", import.meta.url), "utf8"),
    readFile(new URL("./stability-harness.ts", import.meta.url), "utf8"),
  ]);
  for (const copy of ["LOCAL CPU READINESS: EVALUATING", "FORMAL OPT-LD-2 HAS NOT STARTED", "CPU-ONLY", "NOT PRODUCTION", "qualification criterion", "audit16 ↔ audit32", "primary32 ↔ audit32", "radius-8", "radius-2", "17×17", "0.09296875", "readiness-status", "readiness-footer"]) assert.match(html, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /LOCAL CPU READINESS: QUALIFIED/);
  assert.match(html, /receiver frame `\[-1\.4, 1\.4\]²`/);
  assert.match(source, /physicalDisplayRgb\(panel\.item\.qualificationField, panel\.item\.result\.config\)/);
  assert.match(source, /width="512" height="512"/);
  assert.match(source, /LD2_RADIUS2_NEGATIVE_EVIDENCE_CODES/);
  assert.match(source, /radius8MaxTexelNegativeEvidence/);
  assert.match(source, /deriveLd2ReadinessCopy/);
  assert.match(css, /#panels \{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
  const formerOneColumnRule = "@media (max-width:850px) { main { padding:19px 14px 28px; } #panels { grid-template-columns:1fr; } }";
  assert.equal(hasMediaPanelColumnOverride(formerOneColumnRule), true, "the exact former one-column media rule must be rejected");
  assert.equal(hasMediaPanelColumnOverride(css), false, "the 2 × 3 panel matrix must remain three columns at every viewport");
  assert.match(css, /\.receiver-canvas \{ display:block; width:100%; height:auto; aspect-ratio:1 \/ 1;/);
});
