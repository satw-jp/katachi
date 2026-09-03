import assert from "node:assert/strict";
import test from "node:test";
import {
  addSectionRecord,
  addSilhouetteRecord,
  createSilhouetteSectionDocument,
  parseSilhouetteSectionDocument,
  serializeSilhouetteSectionDocument,
  validateSilhouetteSectionDocument,
} from "./silhouetteSection.ts";

const plane = { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
const provenance = [
  { sourceSurfaceId: "surface-1", sourceGestureId: "gesture-1", sourcePointStart: 0, sourcePointEnd: 0, sourceT: 0, order: 0 },
  { sourceSurfaceId: "surface-1", sourceGestureId: "gesture-1", sourcePointStart: 1, sourcePointEnd: 1, sourceT: 1, order: 1 },
];

test("Silhouette and Section contracts preserve planes, contours, view direction, and provenance", () => {
  let document = createSilhouetteSectionDocument();
  document = addSilhouetteRecord(document, {
    id: "silhouette-1",
    surfaceId: "surface-1",
    silhouettePlane: plane,
    viewDirection: "front",
    contour: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    provenance,
    revision: 0,
  });
  document = addSectionRecord(document, {
    id: "section-1",
    surfaceId: "surface-1",
    sectionPlane: plane,
    sectionCurve: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }],
    provenance,
    revision: 0,
  });
  assert.equal(validateSilhouetteSectionDocument(document).valid, true);
  assert.equal(document.silhouettes[0]?.viewDirection, "front");
  assert.equal(document.sections[0]?.provenance[1]?.sourceT, 1);
});

test("Silhouette / Section JSON round-trip is deterministic and validation rejects mismatched provenance", () => {
  const document = addSilhouetteRecord(createSilhouetteSectionDocument(), {
    id: "silhouette-1",
    surfaceId: null,
    silhouettePlane: plane,
    viewDirection: "right",
    contour: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    provenance,
    revision: 0,
  });
  const serialized = serializeSilhouetteSectionDocument(document);
  assert.equal(serializeSilhouetteSectionDocument(parseSilhouetteSectionDocument(serialized)), serialized);
  const broken = structuredClone(document);
  broken.silhouettes[0]!.provenance.pop();
  assert.equal(validateSilhouetteSectionDocument(broken).valid, false);
  assert.throws(() => parseSilhouetteSectionDocument(JSON.stringify(broken)), /provenance length/);
});
