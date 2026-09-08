import assert from "node:assert/strict";
import { buildAstraResearchSnapshot } from "./snapshot.ts";

const open = buildAstraResearchSnapshot("B_OPEN");
const participating = buildAstraResearchSnapshot("B_PARTICIPATING");

assert.equal(open.members.length, 262);
assert.equal(open.attachments.length, 167);
assert.equal(open.junctions.length, 96);
assert.equal(participating.members.length, 325);
assert.equal(participating.attachments.length, 212);
assert.equal(participating.junctions.length, 96);
assert.equal(participating.members.filter((member) => member.layer === "crossLinks").length, 18);
assert.equal(open.source.sourceJunctionCount.provenance, "RECORDED");
assert.equal(open.junctions[0]?.position.provenance, "DERIVED");
assert.equal(open.members.find((member) => member.id === "B_OPEN-G000")?.addedReason.provenance, "NOT RECORDED");
console.log("ok - Astra Research Reader snapshot counts and provenance");
