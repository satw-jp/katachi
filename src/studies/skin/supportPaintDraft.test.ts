import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSupportPaintDraftBinding,
  createSupportPaintDraft,
  serializeSupportPaintDraft,
  supportPaintDraftStorageKey,
  validateSupportPaintDraft,
} from "./supportPaintDraft.ts";
import { emptySupportPaint } from "./supportPaint.ts";

const sha = "a".repeat(64);

test("draft round-trips paint, brush, binding and printApproval=false", () => {
  const draft = createSupportPaintDraft({
    savedAt: "2026-08-25T00:00:00.000Z",
    recipeSha256: sha,
    seed: "katachi",
    targetLongestMm: 119.5,
    supportPaint: emptySupportPaint(119.5),
    brush: { mode: "outside", radiusMm: 7.5, paintBackfaces: false },
  });
  const roundTrip = validateSupportPaintDraft(JSON.parse(serializeSupportPaintDraft(draft)));
  assert.deepEqual(roundTrip, draft);
  assert.equal(roundTrip.printApproval, false);
});

test("recipe SHA and Seed mismatches fail closed", () => {
  const draft = createSupportPaintDraft({
    recipeSha256: sha, seed: "katachi", targetLongestMm: 119.5,
    supportPaint: emptySupportPaint(119.5),
    brush: { mode: "inside", radiusMm: 6, paintBackfaces: false },
  });
  assert.doesNotThrow(() => assertSupportPaintDraftBinding(draft, { recipeSha256: sha, seed: "katachi" }));
  assert.throws(() => assertSupportPaintDraftBinding(draft, { recipeSha256: "b".repeat(64), seed: "katachi" }), /SHA-256/);
  assert.throws(() => assertSupportPaintDraftBinding(draft, { recipeSha256: sha, seed: "other" }), /Seed/);
  assert.throws(() => assertSupportPaintDraftBinding(draft, { recipeSha256: sha, seed: "katachi", targetLongestMm: 120 }), /target size/);
});

test("autosave storage key is deterministic and shape-specific", () => {
  assert.equal(supportPaintDraftStorageKey({ recipeSha256: sha, seed: "a b" }), supportPaintDraftStorageKey({ recipeSha256: sha.toUpperCase(), seed: "a b" }));
  assert.notEqual(supportPaintDraftStorageKey({ recipeSha256: sha, seed: "a" }), supportPaintDraftStorageKey({ recipeSha256: sha, seed: "b" }));
});

test("draft cannot claim print approval or malformed brush settings", () => {
  const base = createSupportPaintDraft({
    recipeSha256: sha, seed: "katachi", targetLongestMm: 119.5,
    supportPaint: emptySupportPaint(119.5),
    brush: { mode: "auto", radiusMm: 6, paintBackfaces: true },
  });
  assert.throws(() => validateSupportPaintDraft({ ...base, printApproval: true }), /printApproval=false/);
  assert.throws(() => validateSupportPaintDraft({ ...base, brush: { ...base.brush, radiusMm: 0 } }), /radius/);
});
