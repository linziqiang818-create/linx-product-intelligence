import assert from "node:assert/strict";
import test from "node:test";
import products from "../app/real-products.json" with { type: "json" };
import { batchCoverage, buildProductGroups, emptyBatchCalibrationState, normalizeBatchCalibrationState } from "../app/batch-calibration.ts";
import type { BatchCalibrationCandidate } from "../app/batch-calibration.ts";

const candidates: BatchCalibrationCandidate[] = products.map((product, index) => ({
  asin: product.asin,
  title: product.title,
  titleZh: product.titleZh ?? product.title,
  category: product.category,
  grade: "C",
  score: 100 - index / 10,
  interestTier: "unrated",
  imageUrl: product.imageUrl,
  sourceUrl: product.sourceUrl,
  price: product.price,
  monthlySales: product.monthlySales ?? 0,
  reasons: [],
}));

test("groups every product exactly once and keeps representative samples small", () => {
  const groups = buildProductGroups(candidates);
  const groupedAsins = groups.flatMap((group) => group.products.map((product) => product.asin));
  assert.ok(groups.length >= 12 && groups.length <= 19);
  assert.equal(groupedAsins.length, candidates.length);
  assert.equal(new Set(groupedAsins).size, candidates.length);
  assert.ok(groups.every((group) => group.representatives.length >= 1 && group.representatives.length <= 3));
});

test("coverage counts completed groups and leaves split groups unresolved", () => {
  const groups = buildProductGroups(candidates);
  const state = emptyBatchCalibrationState();
  for (const group of groups) state.groups[group.id] = { decision: "normal", updatedAt: "2026-07-15T00:00:00.000Z" };
  assert.equal(batchCoverage(groups, state).percent, 100);
  state.groups[groups[0].id].decision = "split";
  const coverage = batchCoverage(groups, state);
  assert.equal(coverage.splitProducts, groups[0].products.length);
  assert.equal(coverage.coveredProducts + coverage.splitProducts, candidates.length);
  assert.ok(coverage.percent < 100);
});

test("rejects malformed stored batch calibration", () => {
  assert.deepEqual(normalizeBatchCalibrationState({ version: 2 }), emptyBatchCalibrationState());
});
