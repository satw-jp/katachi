import assert from "node:assert/strict";
import { buildAstraResearchSnapshot, deriveConnectivityContext } from "./snapshot.ts";

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
assert.equal(open.junctions[0]?.connectedMembers.provenance, "DERIVED");
assert.equal(open.members.find((member) => member.id === "E016")?.addedStage.provenance, "DERIVED");
assert.equal(participating.members.find((member) => member.id === "E146")?.addedStage.provenance, "DERIVED");
assert.equal(open.members.find((member) => member.id === "B_OPEN-G000")?.addedReason.provenance, "NOT RECORDED");
assert.equal(open.fabricationAdditions[0]?.addedStage.provenance, "DERIVED");
assert.equal(open.removableSupports[0]?.role.provenance, "DERIVED");
assert.equal(open.removableSupports[0]?.addedReason.provenance, "NOT RECORDED");
assert.equal(open.fabricationAdditions.find((member) => member.addedReason.value !== null)?.addedReason.provenance, "RECORDED");
const connectedMember = open.members.find((member) => deriveConnectivityContext(open, member).adjacentMembers.value.length > 0);
assert.ok(connectedMember);
const connectedContext = deriveConnectivityContext(open, connectedMember);
assert.equal(connectedContext.adjacentMembers.provenance, "DERIVED");
for (const adjacentId of connectedContext.adjacentMembers.value) {
  const adjacent = open.members.find((member) => member.id === adjacentId);
  assert.ok(adjacent);
  assert.ok(connectedMember.connectedJunctions.value.some((junctionId) => adjacent.connectedJunctions.value.includes(junctionId)));
}
const recordedAttachment = open.attachments.find((member) => member.parentBranch.provenance === "RECORDED");
assert.ok(recordedAttachment);
const attachmentContext = deriveConnectivityContext(open, recordedAttachment);
assert.equal(attachmentContext.recordedParent.provenance, "RECORDED");
assert.equal(attachmentContext.target.provenance, "RECORDED");
const crossLink = participating.members.find((member) => member.layer === "crossLinks");
assert.ok(crossLink);
assert.equal(deriveConnectivityContext(participating, crossLink).recordedParent.provenance, "NOT RECORDED");
console.log("ok - Astra Research Reader snapshot counts and provenance");
