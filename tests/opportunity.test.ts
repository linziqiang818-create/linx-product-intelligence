import assert from "node:assert/strict";
import test from "node:test";
import { assess, type OpportunityInput } from "../app/opportunity.ts";
import { gradeWithDataStatus } from "../app/recommendation-grade.ts";
import { selectionPolicy } from "../app/selection-policy.ts";

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

test("keeps a company-fit niche product in follow-up with hidden opportunity signals", () => {
  const result = assess(base);
  assert.equal(result.qualified, true);
  assert.equal(result.decision, "有条件跟进");
  assert.ok(result.companyFit >= 80);
  assert.ok(result.hiddenOpportunity >= 58);
  assert.ok(result.hiddenSignals.includes("细分场景词明显，适合从相邻类目发现机会"));
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
  assert.equal(gradeWithDataStatus(completed.decision, completed.dataStatus), "B");
});

test("keeps confirmed glass and upholstered supply-chain mismatches in D", () => {
  const cases = [
    { title: "Tempered Glass Display Cabinet", material: "Tempered glass and steel", reason: "玻璃" },
    { title: "Upholstered Accent Chair", material: "Fabric and foam", reason: "软包" },
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

test("uses 180 days as the single new-product boundary", () => {
  const day180 = assess({ ...base, launchDays: 180 });
  const day181 = assess({ ...base, launchDays: 181 });
  assert.equal(selectionPolicy.newProductMaxDays, 180);
  assert.ok(day180.hiddenSignals.includes("新品已出现稳定销量"));
  assert.ok(!day181.hiddenSignals.includes("新品已出现稳定销量"));
});

test("does not use package weight or dimensions to change the selection grade", () => {
  const light = assess({ ...base, packageGrossKg: 12, packageDimensionsCm: "80 x 45 x 18 cm" });
  const heavy = assess({ ...base, packageGrossKg: 95, packageDimensionsCm: "300 x 120 x 80 cm" });
  assert.equal(light.companyFit, heavy.companyFit);
  assert.equal(light.development, heavy.development);
  assert.equal(light.score, heavy.score);
  assert.equal(light.decision, heavy.decision);
  assert.equal(light.hardRejected, false);
  assert.equal(heavy.hardRejected, false);
  assert.equal(heavy.cannotShip, true);
});

test("scores margin progressively around 20 percent without making margin a D rule", () => {
  const low = assess({ ...base, estimatedMargin: 8 });
  const center = assess({ ...base, estimatedMargin: 20 });
  const high = assess({ ...base, estimatedMargin: 36 });
  const modeled = assess({ ...base, estimatedMargin: 0 });

  assert.ok(low.marginScore < center.marginScore);
  assert.ok(center.marginScore < high.marginScore);
  assert.ok(low.score < center.score && center.score < high.score);
  assert.equal(center.marginScore, 50);
  assert.equal(low.hardRejected, false);
  assert.notEqual(low.decision, "暂不建议");
  assert.equal(center.marginWeight, selectionPolicy.margin.quotedWeight);
  assert.equal(modeled.marginWeight, selectionPolicy.margin.modelWeight);
  assert.equal(modeled.marginConfidence, "中");
});

test("rejects confirmed unsupported materials and standardized metal products", () => {
  const cases = [
    { title: "Solid Oak Console Table", category: "Console Tables", material: "100% solid oak hardwood", reason: "纯实木" },
    { title: "Plastic Gaming Chair", category: "Gaming Chairs", material: "Polypropylene plastic and nylon", reason: "电竞椅" },
    { title: "Baby Nursery Crib", category: "Baby Furniture", material: "Solid pine", reason: "婴儿" },
    { title: "Steel Twin Bed Frame", category: "Bed Frames", material: "Powder coated steel", reason: "普通铁床架" },
    { title: "Football Shoulder Pad Rack with Lockable Wheels", category: "Garage Storage & Organization Products", material: "Alloy steel tiered rack", reason: "器材架" },
  ];

  for (const item of cases) {
    const result = assess({ ...base, ...item });
    assert.equal(result.hardRejected, true, item.title);
    assert.equal(result.decision, "暂不建议", item.title);
    assert.ok(result.hardRejectReasons.some((reason) => reason.includes(item.reason)), item.title);
  }
});

test("allows panel-heavy mixed materials and does not classify an ordinary TV stand as D", () => {
  const hybrid = assess({ ...base, title: "Mixed Material Storage Cabinet", material: "Engineered wood, MDF panels and solid wood legs" });
  const tvStand = assess({
    ...base,
    title: "70.8 Inch TV Stand with Power Outlet, Adjustable Shelves and Sliding Doors",
    category: "Television Stands",
    material: "Engineered Wood",
  });
  assert.equal(hybrid.hardRejected, false);
  assert.equal(tvStand.hardRejected, false);
  assert.notEqual(tvStand.decision, "暂不建议");
});

test("routes uncertain category or material to data pending instead of D", () => {
  const unknownMaterial = assess({ ...base, material: "" });
  const unknownCategory = assess({ ...base, category: "Other" });
  assert.equal(unknownMaterial.dataStatus, "needs_data");
  assert.ok(unknownMaterial.dataWarnings.includes("材质待确认"));
  assert.equal(unknownMaterial.hardRejected, false);
  assert.equal(unknownCategory.dataStatus, "needs_data");
  assert.ok(unknownCategory.dataWarnings.includes("类目待确认"));
  assert.equal(unknownCategory.hardRejected, false);
});

test("treats review crowding as a weak reference for differentiated products", () => {
  const lowReviews = assess({ ...base, reviews: 60 });
  const highReviews = assess({ ...base, reviews: 5000 });
  assert.ok(lowReviews.hiddenOpportunity >= highReviews.hiddenOpportunity);
  assert.ok(lowReviews.hiddenOpportunity - highReviews.hiddenOpportunity <= 16);
  assert.ok(lowReviews.score - highReviews.score <= 7);
  assert.equal(highReviews.hardRejected, false);
});
