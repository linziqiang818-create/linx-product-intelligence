import assert from "node:assert/strict";
import test from "node:test";
import { assess, type OpportunityInput } from "../app/opportunity.ts";

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
  assert.equal(result.score, 0);
});

test("treats missing packaging as data status instead of a recommendation conclusion", () => {
  const result = assess({ ...base, packageGrossKg: 0, packageDimensionsCm: "" });
  assert.equal(result.qualified, true);
  assert.equal(result.decision, "需要优化");
  assert.equal(result.dataStatus, "needs_data");
  assert.deepEqual(result.dataWarnings, ["缺少完整包装重量或尺寸"]);
  assert.ok(result.reasons.includes("缺少完整包装重量或尺寸，不能进入推荐榜"));
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
  assert.equal(result.decision, "暂不建议");
});
