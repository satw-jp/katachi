import assert from "node:assert/strict";
import { annotationFor, elementReferenceKey, updateAnnotation } from "./elementAnnotations.ts";

const surface = { domain: "surface" as const, setRevision: 2, patchId: 1 };
const regeneratedSurface = { domain: "surface" as const, setRevision: 3, patchId: 1 };
const interiorField = { domain: "interior" as const, batchRevision: 4, variant: "field-only", unitId: 1 };
const interiorCoin = { domain: "interior" as const, batchRevision: 4, variant: "coin-constrained", unitId: 1 };
let annotations = updateAnnotation([], surface, { keep: true, note: " 残す " });
assert.equal(annotations.length, 1);
assert.deepEqual(annotationFor(annotations, surface), { keep: true, weakContact: false, largeOpening: false, note: "残す" });
assert.deepEqual(annotationFor(annotations, regeneratedSurface), { keep: false, weakContact: false, largeOpening: false, note: "" });
assert.notEqual(elementReferenceKey(interiorField), elementReferenceKey(interiorCoin));
annotations = updateAnnotation(annotations, surface, {});
assert.equal(annotations.length, 0, "empty annotations are removed rather than retained as noise");
console.log("element-annotation tests passed (6 assertions)");
