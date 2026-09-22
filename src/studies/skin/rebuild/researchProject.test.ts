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
  await assert.rejects(() => restoreResearchProject(JSON.stringify(corruptedSource)), /compact fixture identity mismatch/);

  const stateBeforeFailedRestore = reopened;
  await assert.rejects(() => restoreResearchProject(wrongSchema));
  assert.equal(getResearchMember(stateBeforeFailedRestore, "C0002")?.diameterMm, 2.4);
});

test("restore rejects malformed diameter states, including an un-applied redo entry", async () => {
  const state = applyResearchDiameterEdit(
    createResearchProjectState(createF2CompactFixture()),
    "C0002",
    2.4,
  );
  const serialized = serializeResearchProject(state, "2026-09-22T00:00:00.000Z");
  const malformed = (after: { radiusMm: number; diameterMm: number; tipDiameterMm: number; localTaperLengthMm: number }, historyCursor = 1): string => {
    const document = JSON.parse(serialized) as {
      edits: Array<{ after: typeof after }>;
      historyCursor: number;
    };
    document.edits[0].after = after;
    document.historyCursor = historyCursor;
    return JSON.stringify(document);
  };

  await assert.rejects(
    () => restoreResearchProject(malformed({ radiusMm: -1, diameterMm: -2, tipDiameterMm: -2, localTaperLengthMm: 0 })),
    /must be finite and positive/,
  );
  await assert.rejects(
    () => restoreResearchProject(malformed({ radiusMm: 99, diameterMm: 2.8, tipDiameterMm: 2.8, localTaperLengthMm: 0 })),
    /diameterMm = 2/,
  );
  await assert.rejects(
    () => restoreResearchProject(malformed({ radiusMm: 1.2, diameterMm: 2.4, tipDiameterMm: 1.8, localTaperLengthMm: 0 })),
    /tipDiameterMm = diameterMm/,
  );
  await assert.rejects(
    () => restoreResearchProject(malformed({ radiusMm: 1.2, diameterMm: 2.4, tipDiameterMm: 2.4, localTaperLengthMm: 2 })),
    /localTaperLengthMm = 0/,
  );
  await assert.rejects(
    () => restoreResearchProject(malformed({ radiusMm: 1.2, diameterMm: 2.4, tipDiameterMm: 1.8, localTaperLengthMm: 0 }, 0)),
    /tipDiameterMm = diameterMm/,
  );
});

test("compact fixture restore matches known F2 members instead of trusting only hash and count", async () => {
  const serialized = serializeResearchProject(createResearchProjectState(createF2CompactFixture()), "2026-09-22T00:00:00.000Z");
  const changedCoordinates = JSON.parse(serialized) as {
    source: { members: Array<{ id: string; pointsMm: number[][] }> };
  };
  changedCoordinates.source.members.find((member) => member.id === "C0002")!.pointsMm[0][0] += 1;
  await assert.rejects(() => restoreResearchProject(JSON.stringify(changedCoordinates)), /compact fixture member data mismatch at C0002/);

  const changedId = JSON.parse(serialized) as {
    source: { members: Array<{ id: string }> };
  };
  changedId.source.members.find((member) => member.id === "C0002")!.id = "UNKNOWN-MEMBER";
  await assert.rejects(() => restoreResearchProject(JSON.stringify(changedId)), /compact fixture is missing known member C0002/);

  const changedRadius = JSON.parse(serialized) as {
    source: { members: Array<{ id: string; radiusMm: number }> };
  };
  changedRadius.source.members.find((member) => member.id === "C0002")!.radiusMm = 99;
  await assert.rejects(() => restoreResearchProject(JSON.stringify(changedRadius)), /compact fixture member data mismatch at C0002/);
});
