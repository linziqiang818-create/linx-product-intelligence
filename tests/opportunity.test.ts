import assert from "node:assert/strict";
import test from "node:test";
import { assess, type OpportunityInput } from "../app/opportunity.ts";
import { gradeWithDataStatus } from "../app/recommendation-grade.ts";

const base: OpportunityInput = {
  asin: "TEST-ASIN",
  title: "Fluted Craft Storage Cabinet with Drawers",
  category: "Craft Room Furniture",
  price: 169,
  monthlySales: 180,
  launchDays: 120,
  salesGrowth: 22,
  rating: 4.1,
  reviews: 110,
  packageGrossKg: 25,
  packageDimensionsCm: "95 x 48 x 24 cm",
  material: "Engineered wood, MDF, metal drawer slides",
  estimatedMargin: 24,
  priceUplift: 5,
  sourceUrl: "https://example.com/product",
};

test("promotes a company-fit niche product with hidden opportunity signals", () => {
  const result = assess(base);
  assert.equal(result.qualified, true);
  assert.equal(result.decision, "优先跟进");
  assert.ok(result.companyFit >= 80);
  assert.ok(result.hiddenOpportunity >= 62);
  assert.ok(result.hiddenSignals.includes("销量/评论速度异常突出"));
});

test("rejects a popular product that the company should not develop", () => {
  const result = assess({
    ...base,
    title: "Heavy Duty Steel Utility Rack",
    category: "Garage Storage",
    material: "Powder-coated steel",
    monthlySales: 2500,
    reviews: 9000,
    estimatedMargin: 35,
  });
  assert.equal(result.qualified, false);
  assert.equal(result.decision, "暂不建议");
  assert.equal(result.hardRejected, true);
  assert.ok(result.hardRejectReasons.some((reason) => reason.includes("纯金属")));
  assert.equal(result.score, 0);
});

test("keeps missing weight, missing dimensions, and suspicious units out of D", () => {
  const cases = [
    { input: { ...base, packageGrossKg: 0 }, warning: "缺少包装重量" },
    { input: { ...base, packageDimensionsCm: "" }, warning: "缺少包装尺寸" },
    { input: { ...base, packageGrossKg: 47.2, packageDimensionsCm: "9.91 x 5.08 x 3.05 cm" }, warning: "包装尺寸疑似单位错误" },
  ];

  for (const { input, warning } of cases) {
    const result = assess(input);
    assert.equal(result.dataStatus, "needs_data");
    assert.equal(result.hardRejected, false);
    assert.ok(result.dataWarnings.includes(warning));
    assert.notEqual(gradeWithDataStatus(result.decision, result.dataStatus), "D");
  }
});

test("restores normal grading after packaging data is completed", () => {
  const pending = assess({ ...base, packageGrossKg: 0 });
  const completed = assess(base);
  assert.equal(pending.dataStatus, "needs_data");
  assert.equal(completed.dataStatus, "complete");
  assert.equal(gradeWithDataStatus(completed.decision, completed.dataStatus), "A");
});

test("keeps confirmed glass and upholstered supply-chain mismatches in D", () => {
  const cases = [
    { title: "Tempered Glass Display Cabinet", material: "Tempered glass and steel", reason: "玻璃" },
    { title: "Upholstered Accent Chair", material: "Fabric and foam", reason: "软体" },
  ];

  for (const item of cases) {
    const result = assess({ ...base, ...item });
    assert.equal(result.dataStatus, "complete");
    assert.equal(result.hardRejected, true);
    assert.equal(gradeWithDataStatus(result.decision, result.dataStatus), "D");
    assert.ok(result.hardRejectReasons.some((reason) => reason.includes(item.reason)));
  }
});

test("does not mistake a crowded mature listing for a hidden opportunity", () => {
  const result = assess({
    ...base,
    title: "Standard Storage Cabinet with Drawers",
    category: "Home Storage Cabinet",
    monthlySales: 300,
    launchDays: 1500,
    salesGrowth: 0,
    rating: 4.6,
    reviews: 6000,
    priceUplift: 0,
  });
  assert.ok(result.hiddenOpportunity < 48);
  assert.equal(result.hardRejected, false);
  assert.equal(result.decision, "需要优化");
});
