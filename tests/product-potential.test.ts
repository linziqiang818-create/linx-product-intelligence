import assert from "node:assert/strict";
import test from "node:test";
import { isPotentialProduct, marketStageFor, potentialReasons } from "../app/product-potential.ts";

test("flags a recent low-review furniture listing with early demand and novelty", () => {
  const product = { title: "Fluted Rotating Storage Cabinet", launchDays: 120, monthlySales: 95, reviews: 68, salesGrowth: 0.24, rating: 4.1 };
  assert.equal(isPotentialProduct(product), true);
  assert.ok(potentialReasons(product).includes("造型或功能有新颖信号"));
});

test("does not call a mature saturated listing a potential product", () => {
  const product = { title: "Standard Storage Cabinet", launchDays: 1200, monthlySales: 3200, reviews: 8500, salesGrowth: 0.01, rating: 4.7 };
  assert.equal(isPotentialProduct(product), false);
});

test("applies the cautious early-demand and review-barrier boundaries", () => {
  const base = { title: "Fluted Storage Cabinet", launchDays: 180, monthlySales: 300, reviews: 99, salesGrowth: 0.2, rating: 4.1 };
  assert.equal(isPotentialProduct(base), true);
  assert.equal(isPotentialProduct({ ...base, launchDays: 181 }), false);
  assert.equal(isPotentialProduct({ ...base, monthlySales: 49 }), false);
  assert.equal(isPotentialProduct({ ...base, monthlySales: 50 }), true);
  assert.equal(isPotentialProduct({ ...base, monthlySales: 301 }), false);
  assert.equal(isPotentialProduct({ ...base, reviews: 100 }), false);
  assert.equal(marketStageFor(49), "尚未验证");
  assert.equal(marketStageFor(50), "早期验证成功");
  assert.equal(marketStageFor(300), "早期验证成功");
  assert.equal(marketStageFor(301), "爆款");
  assert.ok(potentialReasons(base).includes("月销 50–300，早期验证成功"));
  assert.ok(potentialReasons(base).includes("单 Listing 评论少于 100"));
});
