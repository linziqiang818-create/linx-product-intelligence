import assert from "node:assert/strict";
import test from "node:test";
import { appendLearningEvent, emptyLearningState, mergeLearningStates, recycleProduct } from "../app/learning-state.ts";
import { applyLearningPatch, createLearningPatch, learningPatchCount, splitLearningPatch } from "../app/learning-sync.ts";
import { learningEntriesToState, learningPatchToEntries } from "../app/learning-storage.ts";

test("sends only newer per-ASIN decisions and immutable events", () => {
  const cloud = {
    ...emptyLearningState("2026-08-01T00:00:00.000Z"),
    gradeOverrides: { SAME: { grade: "B" as const, updatedAt: "2026-08-01T00:00:00.000Z" } },
  };
  const local = appendLearningEvent({
    ...cloud,
    gradeOverrides: {
      SAME: { grade: "A" as const, updatedAt: "2026-07-31T00:00:00.000Z" },
      NEW: { grade: "A" as const, updatedAt: "2026-08-02T00:00:00.000Z" },
    },
  }, { id: "new-event", kind: "grade", value: "A", asin: "NEW", createdAt: "2026-08-02T00:00:00.000Z", sessionId: "office" });
  const patch = createLearningPatch(local, cloud);
  assert.equal(patch.gradeOverrides?.SAME, undefined);
  assert.equal(patch.gradeOverrides?.NEW?.grade, "A");
  assert.deepEqual(patch.events?.map((event) => event.id), ["new-event"]);
});

test("does not replay equal-timestamp legacy recycle payloads", () => {
  const recycledAt = new Date("2026-07-24T00:00:00.000Z");
  const cloud = recycleProduct(emptyLearningState(recycledAt.toISOString()), { asin: "RECYCLE", title: "Compact" }, "C", recycledAt);
  const local = { ...cloud, recycleBin: { RECYCLE: { ...cloud.recycleBin.RECYCLE, product: { asin: "RECYCLE", title: "Compact", oversizedLegacyPayload: "x".repeat(10_000) } } } };
  const patch = createLearningPatch(local, cloud);
  assert.equal(Object.keys(patch.recycleBin ?? {}).length, 0);
});

test("splits large offline recovery into bounded idempotent patches", () => {
  let local = emptyLearningState("2026-08-01T00:00:00.000Z");
  for (let index = 0; index < 80; index += 1) {
    const asin = `ASIN${String(index).padStart(6, "0")}`;
    const updatedAt = `2026-08-01T${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`;
    local = appendLearningEvent({ ...local, gradeOverrides: { ...local.gradeOverrides, [asin]: { grade: "B", updatedAt } } }, { id: `event-${index}`, kind: "grade", value: "B", asin, createdAt: updatedAt, sessionId: "office" });
  }
  const patch = createLearningPatch(local, emptyLearningState("2026-07-01T00:00:00.000Z"));
  const chunks = splitLearningPatch(patch, 2_000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => JSON.stringify({ patch: chunk }).length <= 2_000));
  const restored = chunks.reduce((state, chunk) => applyLearningPatch(state, chunk), emptyLearningState("2026-07-01T00:00:00.000Z"));
  assert.deepEqual(mergeLearningStates(restored, local).gradeOverrides, local.gradeOverrides);
  assert.equal(restored.events.length, local.events.length);
  assert.equal(chunks.reduce((total, chunk) => total + learningPatchCount(chunk), 0), learningPatchCount(patch));
});

test("favorite removal remains durable through its event", () => {
  const cloud = appendLearningEvent({ ...emptyLearningState("2026-08-01T00:00:00.000Z"), favorites: ["FAV"] }, { id: "fav-add", kind: "favorite", value: "add", asin: "FAV", createdAt: "2026-08-01T00:00:00.000Z", sessionId: "one" });
  const local = appendLearningEvent({ ...cloud, favorites: [] }, { id: "fav-remove", kind: "favorite", value: "remove", asin: "FAV", createdAt: "2026-08-02T00:00:00.000Z", sessionId: "two" });
  const patch = createLearningPatch(local, cloud);
  const merged = applyLearningPatch(cloud, patch);
  assert.deepEqual(merged.favorites, []);
});

test("stores a large learning diff as independent durable rows", () => {
  const updatedAt = "2099-08-02T00:00:00.000Z";
  const recycled = recycleProduct(emptyLearningState(updatedAt), { asin: "RECYCLE001", title: "Large product record", details: "x".repeat(20_000) }, "C", new Date(updatedAt));
  const local = appendLearningEvent({
    ...recycled,
    gradeOverrides: { RECYCLE001: { grade: "A", updatedAt } },
    favorites: ["RECYCLE001"],
  }, { id: "event-row", kind: "grade", value: "A", asin: "RECYCLE001", createdAt: updatedAt, sessionId: "office" });
  const patch = createLearningPatch(local, emptyLearningState("2099-08-01T00:00:00.000Z"));
  const entries = learningPatchToEntries(patch, updatedAt);
  assert.ok(entries.some((entry) => entry.kind === "grade" && entry.key === "RECYCLE001"));
  assert.ok(entries.some((entry) => entry.kind === "recycle" && entry.key === "RECYCLE001"));
  assert.ok(entries.some((entry) => entry.kind === "event" && entry.key === "event-row"));
  assert.ok(entries.every((entry) => !entry.payload.includes('"gradeOverrides"')));
  const restored = learningEntriesToState(entries, updatedAt);
  assert.equal(restored.gradeOverrides.RECYCLE001.grade, "A");
  assert.equal(restored.recycleBin.RECYCLE001.product.title, "Large product record");
  assert.deepEqual(restored.favorites, ["RECYCLE001"]);
  assert.deepEqual(restored.events.map((event) => event.id), ["event-row"]);
});
