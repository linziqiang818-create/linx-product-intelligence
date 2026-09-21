import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGapReport, missingFields, FOLLOWUP_EVENT_ACTIONS } from "../server/gap-scan.mjs";

const NOW = Date.parse("2026-09-18T12:00:00+08:00");
const daysAgoIso = (n) => new Date(NOW - n * 86_400_000).toISOString();

const product = (asin, patch = {}) => ({
  asin,
  title: "Fluted Sideboard Buffet Cabinet",
  titleZh: "波纹门板餐边柜",
  placement: "pass",
  interest: "",
  tier: "",
  prefScore: 0,
  finalScore: 50,
  monthlySales: 80,
  bsr: 12000,
  launchDays: 90,
  dateFirstAvailable: "",
  packageGrossKg: 30,
  weight: 0,
  packageDimensionsCm: "120 x 45 x 20 cm",
  dimensions: "",
  observedAt: daysAgoIso(3),
  ...patch,
});

test("缺口判定：齐整产品无缺口，缺什么标什么", () => {
  const full = missingFields(product("A"), NOW);
  assert.deepEqual(full, { weight: false, dimensions: false, launch: false, bsr: false, monthlySales: false, titleZh: false, observedAgeDays: 3 });
  const bare = missingFields(product("B", { packageGrossKg: 0, packageDimensionsCm: "", launchDays: 0, bsr: 0, monthlySales: 0, titleZh: "" }), NOW);
  assert.deepEqual({ ...bare, observedAgeDays: undefined }, { weight: true, dimensions: true, launch: true, bsr: true, monthlySales: true, titleZh: true, observedAgeDays: undefined });
});

test("中文标题：占位符文案也算缺失", () => {
  assert.equal(missingFields(product("A", { titleZh: "待自动翻译" }), NOW).titleZh, true);
  assert.equal(missingFields(product("A", { titleZh: "  " }), NOW).titleZh, true);
});

test("跟进名单：收藏 ∪ 感兴趣 ∪ tier 钉住 ∪ 正向事件，负向事件不算", () => {
  const products = [
    product("FAV", { finalScore: 99 }),
    product("INT", { interest: "interested", finalScore: 98 }),
    product("PIN", { tier: "brain", finalScore: 97 }),
    product("EVT", { finalScore: 96 }),
    product("NEG", { finalScore: 95 }),
    product("PLAIN", { finalScore: 94 }),
  ];
  const events = [
    { asin: "EVT", action: "pref_research", weight: 6 },
    { asin: "NEG", action: "cal_reject", weight: -5 },
    { asin: "FAV", action: "unfavorite", weight: -3 },
  ];
  const report = computeGapReport(products, events, [{ asin: "FAV" }], { now: NOW });
  assert.equal(report.overview.followUp, 4);
  assert.ok(report.scopes.followUp.total === 4);
  // 已清除但被收藏的也进跟进名单（用干净的名单，排除上一组夹具的 interest/tier 干扰）
  const rescued = computeGapReport([product("GONE", { placement: "removed" })], [], [{ asin: "GONE" }], { now: NOW });
  assert.equal(rescued.overview.followUp, 1);
});

test("第二大脑范围 = 手动升入 + 正向偏好达标（漏斗语义）", () => {
  const products = [
    product("HOT", { prefScore: 50 }),
    product("COLD", { prefScore: 10 }),
    product("PINNED", { tier: "brain", prefScore: 0 }),
    product("POOLED", { tier: "pool" }),
  ];
  const report = computeGapReport(products, [], [], { now: NOW });
  assert.equal(report.overview.brain, 2);
  assert.equal(report.scopes.brain.total, 2);
});

test("credit 只算 Bright Data 可补的款，纯缺标题不烧 credit", () => {
  const products = [
    product("A", { packageGrossKg: 0 }), // 缺毛重 → 1 credit
    product("B", { titleZh: "" }), // 只缺标题 → LLM，不烧
    product("C", { bsr: 0 }), // 缺 BSR → 1 credit
  ];
  const report = computeGapReport(products, [], [], { now: NOW });
  assert.equal(report.scopes.passAll.creditsNeeded, 2);
  assert.equal(report.scopes.passAll.missing.titleZh, 1);
  assert.equal(report.scopes.passAll.missing.monthlySales, 0);
});

test("Top N 按 finalScore 取 pass 池头部", () => {
  const products = [
    product("TOP1", { finalScore: 90 }),
    product("TOP2", { finalScore: 80 }),
    product("LOW", { finalScore: 10 }),
    product("REMOVED", { finalScore: 99, placement: "removed" }),
  ];
  const report = computeGapReport(products, [], [], { now: NOW, topN: 2 });
  assert.equal(report.scopes.top.total, 2);
  assert.equal(report.scopes.top.missing.titleZh, 0);
});

test("新鲜度：跟进 ∪ Top 并集去重分桶，最旧排前", () => {
  const products = [
    product("OLD1", { finalScore: 90, observedAt: daysAgoIso(60) }),
    product("SHARED", { finalScore: 80, observedAt: "" }),
  ];
  const events = [{ asin: "SHARED", action: "favorite", weight: 5 }];
  const report = computeGapReport(products, events, [], { now: NOW });
  assert.equal(report.watchlist.total, 2);
  assert.equal(report.watchlist.freshness.none, 1);
  assert.equal(report.watchlist.freshness.stale, 1);
  assert.equal(report.watchlist.oldest[0].asin, "OLD1");
  assert.equal(report.watchlist.oldest[0].ageDays, 60);
});

test("FOLLOWUP_EVENT_ACTIONS 全部是正权动作", () => {
  assert.deepEqual([...FOLLOWUP_EVENT_ACTIONS].sort(), ["cal_develop", "cal_priority", "favorite", "interested", "pref_research", "pref_secondary", "rescue"]);
});
