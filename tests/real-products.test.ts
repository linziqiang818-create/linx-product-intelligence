import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dataStatusFor, gradeFromDecision, gradeLabels, hasSuspiciousPackage } from "../app/recommendation-grade.ts";

type RealProduct = { asin: string; title: string; imageUrl: string; sourceUrl: string; estimatedMargin: number; importedAt: string };
const products = JSON.parse(readFileSync(new URL("../app/real-products.json", import.meta.url), "utf8")) as RealProduct[];

test("ships the two merged real-product exports without duplicates", () => {
  assert.equal(products.length, 128);
  assert.equal(new Set(products.map((product) => product.asin)).size, 128);
  assert.ok(products.every((product) => /^[A-Z0-9]{10}$/.test(product.asin)));
});

test("every imported product has a real Amazon image and listing link", () => {
  assert.ok(products.every((product) => product.imageUrl.startsWith("https://m.media-amazon.com/")));
  assert.ok(products.every((product) => product.sourceUrl === `https://www.amazon.com/dp/${product.asin}`));
  assert.ok(products.every((product) => product.title.length > 10));
  assert.ok(products.every((product) => !Number.isNaN(Date.parse(product.importedAt))));
});

test("normalizes exported margin fractions to percentages", () => {
  assert.ok(products.every((product) => product.estimatedMargin === 0 || product.estimatedMargin > 1));
});

test("keeps legacy decision mapping compatible while exposing one A through D conclusion", () => {
  assert.deepEqual([
    gradeFromDecision("优先跟进"),
    gradeFromDecision("有条件跟进"),
    gradeFromDecision("需要优化"),
    gradeFromDecision("待核算"),
    gradeFromDecision("暂不建议"),
  ], ["A", "B", "C", "C", "D"]);
  assert.deepEqual(gradeLabels, { A: "值得开发", B: "继续调研", C: "暂缓", D: "不推荐" });
});

test("detects impossible furniture package dimensions before ranking", () => {
  assert.equal(hasSuspiciousPackage("9.91 x 5.08 x 3.05 cm", 47.2), true);
  assert.equal(hasSuspiciousPackage("110 x 58 x 19 cm", 32), false);
});

test("tracks missing or suspicious packaging as a separate data status", () => {
  assert.equal(dataStatusFor("", 0), "needs_data");
  assert.equal(dataStatusFor("9.91 x 5.08 x 3.05 cm", 47.2), "needs_data");
  assert.equal(dataStatusFor("110 x 58 x 19 cm", 32), "complete");
});
