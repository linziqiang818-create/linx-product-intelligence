import assert from "node:assert/strict";
import test from "node:test";
import { buildCalibrationPairs, normalizeCalibrationState, selectCalibrationSamples, summarizeCalibration } from "../app/calibration.ts";

const candidates = Array.from({ length: 20 }, (_, index) => ({
  asin: `ASIN${index}`,
  title: index === 10 ? "Hidden Trash Cabinet" : `Product ${index}`,
  category: `Category ${index % 7}`,
  grade: (index < 4 ? "B" : index < 10 ? "C" : index > 17 ? "D" : "C") as "B" | "C" | "D",
  score: 100 - index,
}));

test("selects fourteen unique high-value calibration samples", () => {
  const samples = selectCalibrationSamples(candidates);
  assert.equal(samples.length, 14);
  assert.equal(new Set(samples.map((item) => item.asin)).size, 14);
  assert.ok(samples.some((item) => item.grade === "B"));
  assert.ok(samples.some((item) => item.grade === "D"));
  assert.ok(samples.some((item) => item.title.includes("Trash")));
});

test("builds category-diverse comparison pairs", () => {
  const pairs = buildCalibrationPairs(selectCalibrationSamples(candidates));
  assert.equal(pairs.length, 3);
  assert.equal(new Set(pairs.flatMap((pair) => [pair.left, pair.right])).size, 6);
});

test("separates hard rules, soft preferences and questions", () => {
  const summary = summarizeCalibration({
    one: { asin: "one", verdict: "reject", reasons: ["永久禁做类目或材质"], scope: "category", note: "", updatedAt: "now" },
    two: { asin: "two", verdict: "reject", reasons: ["造型不认可"], scope: "product", note: "", updatedAt: "now" },
    three: { asin: "three", verdict: "uncertain", reasons: ["信息不足"], scope: "uncertain", note: "", updatedAt: "now" },
  });
  assert.equal(summary.hardRules.length, 1);
  assert.equal(summary.softPreferences.length, 1);
  assert.equal(summary.questions.length, 1);
});

test("rejects malformed restored calibration state", () => {
  assert.deepEqual(normalizeCalibrationState({ version: 2 }), { version: 1, feedback: {}, pairFeedback: {} });
});
