import assert from "node:assert/strict";
import { normalizedScreenRect, screenTriangleIntersectsRect } from "./screenRectSelection.ts";

const rect = normalizedScreenRect(30, 40, 10, 20);
assert.deepEqual(rect, { left: 10, top: 20, right: 30, bottom: 40 });
assert.equal(screenTriangleIntersectsRect([
  { x: 15, y: 25 }, { x: 25, y: 25 }, { x: 20, y: 35 },
], rect), true, "triangle contained by marquee must be selected");
assert.equal(screenTriangleIntersectsRect([
  { x: 0, y: 29 }, { x: 40, y: 29 }, { x: 20, y: 31 },
], rect), true, "thin triangle crossing the marquee must not be missed");
assert.equal(screenTriangleIntersectsRect([
  { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 60 },
], rect), true, "marquee contained by a large triangle must select it");
assert.equal(screenTriangleIntersectsRect([
  { x: 50, y: 50 }, { x: 60, y: 50 }, { x: 55, y: 60 },
], rect), false);
console.log("skin-rebuild screen rectangle selection tests passed");
