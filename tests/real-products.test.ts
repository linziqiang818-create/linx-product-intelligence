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
import { minimumFormalAdmission } from "../app/formal-admission.ts";

type RealProduct = { asin: string; title: string; titleZh?: string; category: string; imageUrl?: string; sourceUrl: string; discoverySource?: string; admissionEvidence?: { sourceUrl?: string }; estimatedMargin?: number; importedAt: string; monthlySales?: number; monthlySalesEstimate?: { min?: number; max?: number; confidence?: string; source?: string }; launchDays?: number; salesGrowth?: number; rating?: number; reviews?: number; packageGrossKg?: number; packageDimensionsCm?: string; material?: string; priceUplift?: number; price?: number; note: string; sourceDataProvider?: string };
const products = JSON.parse(readFileSync(new URL("../app/real-products.json", import.meta.url), "utf8")) as RealProduct[];
const rejectedProducts = JSON.parse(readFileSync(new URL("../app/rejected-products.json", import.meta.url), "utf8")) as RealProduct[];

test("ships the curated Amazon US research batch without duplicates", () => {
  assert.ok(products.length >= 50);
  assert.equal(new Set(products.map((product) => product.asin)).size, products.length);
  assert.ok(products.every((product) => /^[A-Z0-9]{10}$/.test(product.asin)));
});

test("every imported product passes the minimum formal admission gate", () => {
  assert.ok(products.every((product) => minimumFormalAdmission(product).eligible));
  assert.ok(products.every((product) => Boolean(product.imageUrl)));
  assert.ok(products.every((product) => /[\u3400-\u9fff]/.test(String(product.titleZh ?? ""))));
  assert.ok(products.every((product) => !/待自动翻译|待补充中文标题/.test(String(product.titleZh ?? ""))));
  assert.ok(products.every((product) => !Number.isNaN(Date.parse(product.importedAt))));
});

test("keeps rejected products reviewable with Chinese titles and explicit legacy image exceptions", () => {
  assert.ok(rejectedProducts.every((product) => /[\u3400-\u9fff]/.test(String(product.titleZh ?? ""))));
  const missingImageAsins = rejectedProducts.filter((product) => !product.imageUrl).map((product) => product.asin).sort();
  assert.deepEqual(missingImageAsins, ["B08KXSBJQJ", "B08Z3R5DGX", "B0BHVNLJXG", "B0C7FXVDK3"]);
});

test("normalizes exported margin fractions to percentages", () => {
  assert.ok(products.every((product) => product.estimatedMargin === undefined || product.estimatedMargin === 0 || product.estimatedMargin > 1));
});

test("does not invent Amazon fields that were unavailable on the public search pages", () => {
  assert.ok(products.every((product) => product.monthlySales === undefined));
  assert.ok(products.every((product) => product.sourceDataProvider === "SellerSprite"
    || (product.launchDays === undefined && product.packageGrossKg === undefined && product.packageDimensionsCm === undefined)));
  assert.ok(products.every((product) => product.monthlySalesEstimate === undefined || (
    Number.isFinite(product.monthlySalesEstimate.min)
    && Number.isFinite(product.monthlySalesEstimate.max)
    && Number(product.monthlySalesEstimate.min) >= 0
    && Number(product.monthlySalesEstimate.max) >= Number(product.monthlySalesEstimate.min)
    && Boolean(product.monthlySalesEstimate.confidence)
    && Boolean(product.monthlySalesEstimate.source)
  )));
});

test("keeps legacy decision mapping compatible while exposing one A through D conclusion", () => {
  assert.deepEqual([
    gradeFromDecision("优先跟进"),
    gradeFromDecision("有条件跟进"),
    gradeFromDecision("需要优化"),
    gradeFromDecision("待核算"),
    gradeFromDecision("暂不建议"),
  ], ["A", "B", "C", "C", "D"]);
  assert.deepEqual(gradeLabels, { A: "高价值设计机会", B: "良好开发候选", C: "低概率开发", D: "不适合当前方向" });
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

test("keeps data completeness separate from the business grade", () => {
  assert.equal(gradeWithDataStatus("优先跟进", "needs_data"), "A");
  assert.equal(gradeWithDataStatus("有条件跟进", "needs_data"), "B");
  assert.equal(gradeWithDataStatus("需要优化", "complete"), "C");
});
