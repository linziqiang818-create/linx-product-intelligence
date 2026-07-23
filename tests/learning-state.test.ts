import assert from "node:assert/strict";
import test from "node:test";
import { daysUntilPurge, emptyLearningState, learningEvidenceCount, normalizeLearningState, recycleProduct, restoreRecycledProduct } from "../app/learning-state.ts";

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
