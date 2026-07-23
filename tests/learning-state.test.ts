import assert from "node:assert/strict";
import test from "node:test";
import { appendLearningEvent, appendReflectionReport, daysUntilPurge, emptyLearningState, learningEvidenceCount, mergeLearningStates, migrateLegacyCalibration, normalizeLearningState, recycleProduct, restoreRecycledProduct } from "../app/learning-state.ts";

test("recycle bin keeps a product for thirty days and then purges its data", () => {
  const now = new Date("2026-07-23T00:00:00.000Z");
  const recycled = recycleProduct(emptyLearningState(now.toISOString()), { asin: "RECYCLE001", title: "Cabinet" }, "B", now);
  assert.equal(daysUntilPurge(recycled.recycleBin.RECYCLE001.purgeAt, now.getTime()), 30);
  const purged = normalizeLearningState(recycled, new Date("2026-08-23T00:00:00.000Z").getTime());
  assert.equal(purged.recycleBin.RECYCLE001, undefined);
  assert.ok(purged.purgedAsins.includes("RECYCLE001"));
});

test("restoring a recycled product keeps the chosen manual grade", () => {
  const recycled = recycleProduct(emptyLearningState(), { asin: "RECYCLE002", title: "Sideboard" }, "C");
  const restored = restoreRecycledProduct(recycled, "RECYCLE002", "A");
  assert.equal(restored.recycleBin.RECYCLE002, undefined);
  assert.equal(restored.gradeOverrides.RECYCLE002.grade, "A");
});

test("distinguishes an empty cloud profile from a local profile with prior feedback", () => {
  const empty = emptyLearningState();
  const learned = { ...empty, favorites: ["B0EXAMPLE"] };
  assert.equal(learningEvidenceCount(empty), 0);
  assert.equal(learningEvidenceCount(learned), 1);
});

test("migrates old calibration clicks without turning a soft rejection into D", () => {
  const migrated = migrateLegacyCalibration(emptyLearningState(), { version: 1, feedback: {
    PRIORITY: { verdict: "develop", interest: "priority", updatedAt: "2026-07-20T00:00:00.000Z" },
    NORMAL: { verdict: "develop", interest: "normal", updatedAt: "2026-07-20T00:00:00.000Z" },
    REJECTED: { verdict: "reject", scope: "product", updatedAt: "2026-07-20T00:00:00.000Z" },
  }, pairFeedback: { one: { choice: "left" } } });
  assert.equal(migrated.gradeOverrides.PRIORITY.grade, "A");
  assert.equal(migrated.gradeOverrides.NORMAL.grade, "B");
  assert.equal(migrated.gradeOverrides.REJECTED.grade, "C");
  assert.ok(migrated.legacyCalibration);
});

test("migrates v1 state to v2 without losing existing projections", () => {
  const migrated = normalizeLearningState({ version: 1, gradeOverrides: { ASIN1: { grade: "A", updatedAt: "2026-07-20T00:00:00.000Z" } }, favorites: ["ASIN1"], updatedAt: "2026-07-20T00:00:00.000Z" });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.gradeOverrides.ASIN1.grade, "A");
  assert.deepEqual(migrated.favorites, ["ASIN1"]);
  assert.deepEqual(migrated.events, []);
});

test("merges independent device operations and deduplicates immutable evidence", () => {
  const base = emptyLearningState("2026-07-20T00:00:00.000Z");
  const left = appendLearningEvent({
    ...base,
    gradeOverrides: { LEFT: { grade: "A", updatedAt: "2026-07-21T00:00:00.000Z" } },
  }, { id: "event-left", kind: "grade", value: "A", asin: "LEFT", createdAt: "2026-07-21T00:00:00.000Z", sessionId: "one" });
  const right = appendLearningEvent({
    ...base,
    gradeOverrides: { RIGHT: { grade: "C", updatedAt: "2026-07-22T00:00:00.000Z" } },
  }, { id: "event-right", kind: "grade", value: "C", asin: "RIGHT", createdAt: "2026-07-22T00:00:00.000Z", sessionId: "two" });
  const merged = mergeLearningStates(left, right);
  assert.deepEqual(Object.keys(merged.gradeOverrides).sort(), ["LEFT", "RIGHT"]);
  assert.deepEqual(merged.events.map((event) => event.id), ["event-left", "event-right"]);
  assert.equal(mergeLearningStates(merged, left).events.length, 2);
});

test("stores an actual reflection report as learning evidence", () => {
  const state = appendReflectionReport(emptyLearningState(), {
    id: "report-one",
    createdAt: "2026-07-23T00:00:00.000Z",
    fromAt: "2026-07-22T00:00:00.000Z",
    toAt: "2026-07-23T00:00:00.000Z",
    eventIds: ["one"],
    actionCounts: { "grade:A": 1 },
    gradeCounts: { A: 1, B: 0, C: 0, D: 0 },
    familySignals: [],
    contradictions: [],
  });
  assert.equal(state.reflectionReports[0].id, "report-one");
  assert.ok(learningEvidenceCount(state) > 0);
});
