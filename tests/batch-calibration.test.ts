import assert from "node:assert/strict";
import test from "node:test";
import products from "../app/real-products.json" with { type: "json" };
import { batchCoverage, buildChallengePairs, buildProductGroups, emptyBatchCalibrationState, normalizeBatchCalibrationState, selectChallengeCandidates, selectUnpairedChallengers } from "../app/batch-calibration.ts";
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

test("coverage treats split as a completed group decision", () => {
  const groups = buildProductGroups(candidates);
  const state = emptyBatchCalibrationState();
  for (const group of groups) state.groups[group.id] = { decision: "normal", updatedAt: "2026-07-15T00:00:00.000Z" };
  assert.equal(batchCoverage(groups, state).percent, 100);
  state.groups[groups[0].id].decision = "split";
  const coverage = batchCoverage(groups, state);
  assert.equal(coverage.splitProducts, groups[0].products.length);
  assert.equal(coverage.coveredProducts, candidates.length);
  assert.equal(coverage.decidedGroups, groups.length);
  assert.equal(coverage.percent, 100);
});

test("rejects malformed stored batch calibration", () => {
  assert.deepEqual(normalizeBatchCalibrationState({ version: 2 }), emptyBatchCalibrationState());
});

test("migrates the completed v1 group feedback without losing it", () => {
  const migrated = normalizeBatchCalibrationState({ version: 1, groups: { beds: { decision: "split", updatedAt: "now" } }, audit: { A1: { decision: "exclude", updatedAt: "now" } } });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.groups.beds.decision, "split");
  assert.equal(migrated.research.A1.decision, "pass");
});

test("exploration prioritizes split groups and excludes the existing candidate pool", () => {
  const groups = buildProductGroups(candidates);
  const state = emptyBatchCalibrationState();
  for (const group of groups) state.groups[group.id] = { decision: "normal", updatedAt: "now" };
  const splitGroup = groups.find((group) => group.products.length >= 3)!;
  state.groups[splitGroup.id].decision = "split";
  const excluded = new Set([splitGroup.products[0].asin]);
  const selected = selectChallengeCandidates(groups, state, excluded);
  assert.ok(!selected.some((product) => excluded.has(product.asin)));
  assert.equal(selected[0].asin, splitGroup.products[1].asin);
});

test("builds deterministic head-to-head comparisons", () => {
  const pairs = buildChallengePairs(candidates.slice(0, 4), candidates.slice(10, 13));
  assert.equal(pairs.length, 4);
  assert.equal(pairs[0].anchor.asin, candidates[10].asin);
  assert.equal(pairs[3].anchor.asin, candidates[10].asin);
  assert.equal(new Set(pairs.map((pair) => pair.id)).size, 4);
});

test("never asks the user to compare a challenger twice when anchors change", () => {
  const state = emptyBatchCalibrationState();
  state.challenges.old = { decision: "challenger", challengerAsin: candidates[0].asin, anchorAsin: candidates[10].asin, updatedAt: "now" };
  const remaining = selectUnpairedChallengers(candidates.slice(0, 3), state);
  assert.deepEqual(remaining.map((product) => product.asin), [candidates[1].asin, candidates[2].asin]);
});
