import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gradeFromDecision, hasSuspiciousPackage } from "../app/recommendation-grade.ts";

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

test("maps business decisions to A through D without exposing a number", () => {
  assert.deepEqual([
    gradeFromDecision("优先跟进"),
    gradeFromDecision("有条件跟进"),
    gradeFromDecision("待核算"),
    gradeFromDecision("暂不建议"),
  ], ["A", "B", "C", "D"]);
});

test("detects impossible furniture package dimensions before ranking", () => {
  assert.equal(hasSuspiciousPackage("9.91 x 5.08 x 3.05 cm", 47.2), true);
  assert.equal(hasSuspiciousPackage("110 x 58 x 19 cm", 32), false);
});
