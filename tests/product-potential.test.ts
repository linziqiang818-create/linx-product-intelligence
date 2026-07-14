import assert from "node:assert/strict";
import test from "node:test";
import { isPotentialProduct, potentialReasons } from "../app/product-potential.ts";

test("flags a recent low-review furniture listing with early demand and novelty", () => {
  const product = { title: "Fluted Rotating Storage Cabinet", launchDays: 120, monthlySales: 95, reviews: 68, salesGrowth: 0.24, rating: 4.1 };
  assert.equal(isPotentialProduct(product), true);
  assert.ok(potentialReasons(product).includes("造型或功能有新颖信号"));
});

test("does not call a mature saturated listing a potential product", () => {
  const product = { title: "Standard Storage Cabinet", launchDays: 1200, monthlySales: 3200, reviews: 8500, salesGrowth: 0.01, rating: 4.7 };
  assert.equal(isPotentialProduct(product), false);
});
