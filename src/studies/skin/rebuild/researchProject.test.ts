import assert from "node:assert/strict";
import test from "node:test";
import {
  F2_SOURCE_MEMBER_COUNT,
  F2_SOURCE_SHA256,
  applyResearchDiameterEdit,
  buildResearchPreview,
  createF2CompactFixture,
  createResearchProjectState,
  getResearchMember,
  parseResearchProjectDocument,
  researchEditEligibility,
  restoreResearchProject,
  serializeResearchProject,
  undoResearchEdit,
  redoResearchEdit,
} from "./researchProject.ts";

test("F2 compact fixture retains explicit identity, ids and omitted-reference marker", () => {
  const fixture = createF2CompactFixture();
  assert.equal(fixture.identity.sha256, F2_SOURCE_SHA256);
  assert.equal(fixture.identity.sourceMemberCount, F2_SOURCE_MEMBER_COUNT);
  assert.equal(fixture.identity.loadedMemberCount, 5);
  assert.equal(fixture.identity.omittedMemberCount, 4346);
  assert.deepEqual(fixture.members.map((member) => member.id), ["C0002", "C0003", "R0000", "SP001", "A4139"]);
  assert.equal(fixture.members.find((member) => member.id === "A4139")?.raw.compact_fixture_omits_intermediate_points, 13);
});

test("C0002 diameter edit is bounded, reversible and does not change other members", () => {
  const state = createResearchProjectState(createF2CompactFixture());
  const c3Before = getResearchMember(state, "C0003");
  const c2Before = getResearchMember(state, "C0002");
  assert.equal(researchEditEligibility(getResearchMember(state, "R0000")).eligible, false);
  assert.equal(researchEditEligibility(getResearchMember(state, "A4139")).eligible, false);
  const edited = applyResearchDiameterEdit(state, "C0002", 2.4);
  const c2Edited = getResearchMember(edited, "C0002");
  assert.equal(c2Edited?.diameterMm, 2.4);
  assert.equal(c2Edited?.radiusMm, 1.2);
  assert.equal(c2Edited?.tipDiameterMm, 2.4);
  assert.deepEqual(c2Edited?.pointsMm, c2Before?.pointsMm);
  assert.deepEqual(getResearchMember(edited, "C0003"), c3Before);
  assert.equal(edited.history.length, 1);
  assert.equal(edited.historyCursor, 1);

  const undone = undoResearchEdit(edited);
  assert.equal(getResearchMember(undone, "C0002")?.diameterMm, 3);
  const redone = redoResearchEdit(undone);
  assert.equal(getResearchMember(redone, "C0002")?.diameterMm, 2.4);
  assert.equal(buildResearchPreview(redone).edgeIdByMemberId.get("C0002") !== undefined, true);
});

test("research project save/reopen verifies provenance and rejects wrong restore", async () => {
  const state = applyResearchDiameterEdit(
    createResearchProjectState(createF2CompactFixture()),
    "C0002",
    2.4,
  );
  const serialized = serializeResearchProject(state, "2026-09-22T00:00:00.000Z");
  const parsed = parseResearchProjectDocument(serialized);
  assert.equal(parsed.schema, "katachi.skin.research-project.v0");
  assert.equal(parsed.historyCursor, 1);
  const reopened = await restoreResearchProject(serialized);
  assert.equal(getResearchMember(reopened, "C0002")?.diameterMm, 2.4);
  assert.equal(reopened.source.identity.sourceFileUnchanged, true);

  const wrongSchema = serialized.replace("katachi.skin.research-project.v0", "unknown.schema");
  await assert.rejects(() => restoreResearchProject(wrongSchema), /unknown research project schema/);

  const unknownEdit = JSON.parse(serialized) as { edits: Array<{ memberId: string }> };
  unknownEdit.edits[0].memberId = "UNKNOWN-MEMBER";
  await assert.rejects(() => restoreResearchProject(JSON.stringify(unknownEdit)), /unknown member/);

  const corruptedSource = JSON.parse(serialized) as { source: { identity: { sha256: string } } };
  corruptedSource.source.identity.sha256 = "0".repeat(64);
  await assert.rejects(() => restoreResearchProject(JSON.stringify(corruptedSource)), /compact fixture source identity/);
});
