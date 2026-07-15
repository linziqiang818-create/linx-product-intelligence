import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  dataIssuesFor,
  dataStatusFor,
  gradeFromDecision,
  gradeLabels,
  gradeWithDataStatus,
  hasSuspiciousPackage,
} from "../app/recommendation-grade.ts";

type RealProduct = { asin: string; title: string; category: string; imageUrl: string; sourceUrl: string; estimatedMargin?: number; importedAt: string; monthlySales?: number; launchDays?: number; salesGrowth?: number; rating: number; reviews: number; packageGrossKg?: number; packageDimensionsCm?: string; material: string; priceUplift: number; price: number; note: string };
const products = JSON.parse(readFileSync(new URL("../app/real-products.json", import.meta.url), "utf8")) as RealProduct[];

test("ships the curated Amazon US research batch without duplicates", () => {
  assert.equal(products.length, 50);
  assert.equal(new Set(products.map((product) => product.asin)).size, 50);
  assert.ok(products.every((product) => /^[A-Z0-9]{10}$/.test(product.asin)));
});

test("every imported product has a real Amazon image and listing link", () => {
  assert.ok(products.every((product) => product.imageUrl.startsWith("https://m.media-amazon.com/")));
  assert.ok(products.every((product) => product.sourceUrl === `https://www.amazon.com/dp/${product.asin}`));
  assert.ok(products.every((product) => product.title.length > 10));
  assert.ok(products.every((product) => !Number.isNaN(Date.parse(product.importedAt))));
});

test("normalizes exported margin fractions to percentages", () => {
  assert.ok(products.every((product) => product.estimatedMargin === undefined || product.estimatedMargin === 0 || product.estimatedMargin > 1));
});

test("does not invent Amazon fields that were unavailable on the public search pages", () => {
  assert.ok(products.every((product) => product.monthlySales === undefined));
  assert.ok(products.every((product) => product.launchDays === undefined));
  assert.ok(products.every((product) => product.packageGrossKg === undefined));
  assert.ok(products.every((product) => product.packageDimensionsCm === undefined));
  assert.ok(products.every((product) => product.note.includes("未使用推测值")));
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

test("routes missing or suspicious packaging to data pending without assigning D", () => {
  assert.equal(dataStatusFor("110 x 58 x 19 cm", 0), "needs_data");
  assert.deepEqual(dataIssuesFor("110 x 58 x 19 cm", 0), ["缺少包装重量"]);
  assert.equal(dataStatusFor("", 32), "needs_data");
  assert.deepEqual(dataIssuesFor("", 32), ["缺少包装尺寸"]);
  assert.equal(dataStatusFor("9.91 x 5.08 x 3.05 cm", 47.2), "needs_data");
  assert.deepEqual(dataIssuesFor("9.91 x 5.08 x 3.05 cm", 47.2), ["包装尺寸疑似单位错误"]);
  assert.equal(gradeWithDataStatus("暂不建议", "needs_data"), "D");
});

test("returns a product to normal grading after packaging data is completed", () => {
  assert.equal(dataStatusFor("110 x 58 x 19 cm", 32), "complete");
  assert.equal(gradeWithDataStatus("优先跟进", "complete"), "A");
  assert.equal(gradeWithDataStatus("暂不建议", "complete"), "D");
});
