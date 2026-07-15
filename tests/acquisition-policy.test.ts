import assert from "node:assert/strict";
import test from "node:test";
import { acquisitionPolicy, currentResearchPoolSummary, salesEvidenceLabel } from "../app/acquisition-policy.ts";
import { preliminaryPriority } from "../app/acquisition-priority.ts";

test("reserves twenty percent of every research batch for unexpected opportunities", () => {
  assert.equal(Object.values(acquisitionPolicy.mix).reduce((sum, count) => sum + count, 0), acquisitionPolicy.batchSize);
  assert.equal(acquisitionPolicy.mix.exploration, 10);
});

test("documents the exact composition of the current fifty-product pool", () => {
  assert.equal(currentResearchPoolSummary().reduce((sum, group) => sum + group.count, 0), 50);
});

test("labels public sales evidence without pretending an estimate is exact", () => {
  assert.deepEqual(salesEvidenceLabel({ monthlySales: 83 }), { value: "83", source: "数据源月销量" });
  assert.deepEqual(salesEvidenceLabel({ estimatedLow: 50, estimatedHigh: 100 }), { value: "50–100", source: "LINX估算区间" });
  assert.deepEqual(salesEvidenceLabel({ boughtPastMonth: 50 }), { value: "≥50", source: "Amazon近月购买提示" });
  assert.deepEqual(salesEvidenceLabel({}), { value: "—", source: "待首次监测" });
});

test("prioritizes likely company-fit products before enriching the whole pool", () => {
  const niche = preliminaryPriority({ title: "Fluted Hidden Cat Litter Box Cabinet with Sliding Door", price: 189, discoveryLane: "blue-ocean-red" });
  const ordinary = preliminaryPriority({ title: "Simple Small Side Table", price: 45, discoveryLane: "exploration" });
  const rejected = preliminaryPriority({ title: "Solid Oak Mirrored Glass Cabinet", price: 399 });
  assert.equal(niche.disposition, "priority");
  assert.ok(niche.score > ordinary.score);
  assert.equal(rejected.disposition, "trash");
});
