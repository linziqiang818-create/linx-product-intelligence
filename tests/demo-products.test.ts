import assert from "node:assert/strict";
import test from "node:test";
import { demoProducts } from "../app/demo-products.ts";
import { assess } from "../app/opportunity.ts";

const assessed = demoProducts.map((product) => ({
  product,
  result: assess({
    asin: product.asin,
    title: product.title,
    category: product.category,
    price: product.price,
    monthlySales: product.monthlySales,
    launchDays: product.launchDays,
    salesGrowth: product.salesGrowth,
    rating: product.rating,
    reviews: product.reviews,
    packageGrossKg: product.packageGrossKg,
    packageDimensionsCm: product.packageDimensionsCm,
    material: product.material,
    estimatedMargin: product.estimatedMargin,
    priceUplift: product.priceUplift,
    sourceUrl: product.sourceUrl,
  }),
}));

test("ships exactly 50 clearly labelled demonstration products", () => {
  assert.equal(demoProducts.length, 50);
  assert.equal(new Set(demoProducts.map((product) => product.asin)).size, 50);
  assert.ok(demoProducts.every((product) => product.asin.startsWith("TEST-")));
});

test("the demonstration set produces a useful shortlist instead of passing everything", () => {
  const recommended = assessed.filter(({ result }) => result.decision === "优先跟进" || result.decision === "有条件跟进");
  const rejected = assessed.filter(({ result }) => result.decision === "暂不建议");
  assert.ok(recommended.length >= 8 && recommended.length <= 25, `recommended ${recommended.length}`);
  assert.ok(rejected.length >= 15, `rejected ${rejected.length}`);
  assert.ok(recommended.every(({ result }) => result.qualified));
  assert.ok(rejected.every(({ result }) => result.hardRejected));
});

test("obvious false positives stay out while hidden-fit examples reach the shortlist", () => {
  const byAsin = new Map(assessed.map((entry) => [entry.product.asin, entry.result]));
  for (const asin of ["TEST-021", "TEST-023", "TEST-031", "TEST-037"]) {
    assert.equal(byAsin.get(asin)?.decision, "暂不建议", asin);
  }
  assert.equal(byAsin.get("TEST-039")?.hardRejected, false);
  assert.notEqual(byAsin.get("TEST-039")?.decision, "暂不建议");
  assert.equal(byAsin.get("TEST-042")?.hardRejected, false);
  assert.equal(byAsin.get("TEST-042")?.decision, "需要优化");
  for (const asin of ["TEST-001", "TEST-003", "TEST-005", "TEST-008", "TEST-012", "TEST-017"]) {
    assert.ok(["优先跟进", "有条件跟进"].includes(byAsin.get(asin)?.decision ?? ""), asin);
  }
});
