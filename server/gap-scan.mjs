// 缺口扫描（第 1 步·纯离线）：统计缺什么、谁在跟进、数据多旧，为富化与刷新排队做底。
// 只读打开数据库，不写库、不联网；tier 列不存在（服务尚未重启迁移）时自动退化为 prefScore 判定。
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAIN_AUTO_THRESHOLD } from "./preference.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const defaultDbPath = process.env.LINX_DB || join(here, "..", "data", "linx.db");

// 构成"跟进名单"的正向信号：动过手的才算要跟的，pass 池里没互动的不烧额度
export const FOLLOWUP_EVENT_ACTIONS = ["favorite", "interested", "rescue", "cal_develop", "cal_priority", "pref_research", "pref_secondary"];

const NEED_COLUMNS = [
  "asin", "title", "titleZh", "placement", "interest", "prefScore", "finalScore", "autoBrain",
  "monthlySales", "bsr", "launchDays", "dateFirstAvailable", "packageGrossKg", "weight",
  "packageDimensionsCm", "dimensions", "observedAt", "tier",
];

const PLACEHOLDER_ZH = /待自动翻译|待补充中文标题/;

function daysAgo(iso, now) {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? Math.floor((now - t) / 86_400_000) : null;
}

// 单款产品的缺口清单：BD 可补 = 毛重/尺寸/上架天数/BSR（amazon_product 一条记录全带）；月销精确值只能靠卖家精灵；中文标题靠 LLM
export function missingFields(p = {}, now = Date.now()) {
  const weight = !(Number(p.packageGrossKg) > 0 || Number(p.weight) > 0);
  const dimensions = !String(p.packageDimensionsCm || "").trim() && !String(p.dimensions || "").trim();
  const launch = !(Number(p.launchDays) > 0) && !String(p.dateFirstAvailable || "").trim();
  const bsr = !(Number(p.bsr) > 0);
  const monthlySales = !(Number(p.monthlySales) > 0);
  const titleZh = !String(p.titleZh || "").trim() || PLACEHOLDER_ZH.test(String(p.titleZh));
  const observedAgeDays = daysAgo(p.observedAt, now);
  return { weight, dimensions, launch, bsr, monthlySales, titleZh, observedAgeDays };
}

function scopeStats(rows) {
  const missing = { titleZh: 0, weight: 0, dimensions: 0, launch: 0, bsr: 0, monthlySales: 0 };
  let anyBrightData = 0;
  for (const p of rows) {
    const m = missingFields(p);
    for (const key of Object.keys(missing)) if (m[key]) missing[key]++;
    if (m.weight || m.dimensions || m.launch || m.bsr) anyBrightData++;
  }
  return { total: rows.length, missing, creditsNeeded: anyBrightData };
}

export function computeGapReport(products, events = [], favorites = [], options = {}) {
  const now = options.now ?? Date.now();
  const topN = options.topN ?? 200;
  const staleDays = options.staleDays ?? 30;

  const followUpAsins = new Set(favorites.map((f) => f.asin ?? f));
  for (const e of events) {
    if (FOLLOWUP_EVENT_ACTIONS.includes(e.action) && Number(e.weight) > 0) followUpAsins.add(e.asin);
  }
  for (const p of products) {
    if (p.interest === "interested" || p.tier === "brain") followUpAsins.add(p.asin);
  }

  const pass = [];
  const brain = [];
  for (const p of products) {
    if (p.placement !== "pass") continue;
    pass.push(p);
    // 分层语义（2026-09-18）：第二大脑 = 手动升入 + 锚点达标 + 各类目优中选优
    const tier = p.tier ?? "";
    const autoBrain = (p.autoBrain ?? 0) === 1;
    if (tier === "brain" || (tier === "" && (Number(p.prefScore) >= BRAIN_AUTO_THRESHOLD || autoBrain))) brain.push(p);
  }
  const followUp = products.filter((p) => followUpAsins.has(p.asin));
  const top = [...pass].sort((a, b) => (Number(b.finalScore) || 0) - (Number(a.finalScore) || 0)).slice(0, topN);

  // 观察名单 = 跟进 ∪ 评分头部：这是近期真的会打开看的产品，新鲜度和刷新成本都按它算
  const watchAsins = new Set([...followUpAsins, ...top.map((p) => p.asin)]);
  const watch = products.filter((p) => watchAsins.has(p.asin));
  const freshness = { none: 0, fresh: 0, aging: 0, stale: 0 };
  const oldest = [];
  for (const p of watch) {
    const age = daysAgo(p.observedAt, now);
    if (age === null) freshness.none++;
    else if (age <= 14) freshness.fresh++;
    else if (age <= staleDays) freshness.aging++;
    else freshness.stale++;
    if (age !== null) oldest.push({ asin: p.asin, title: p.titleZh || p.title, ageDays: age });
  }
  oldest.sort((a, b) => b.ageDays - a.ageDays);

  return {
    generatedAt: new Date(now).toISOString(),
    topN,
    staleDays,
    overview: {
      total: products.length,
      pass: pass.length,
      removed: products.length - pass.length,
      favorites: favorites.length,
      brain: brain.length,
      followUp: followUp.length,
    },
    scopes: {
      followUp: scopeStats(followUp),
      brain: scopeStats(brain),
      top: scopeStats(top),
      passAll: scopeStats(pass),
    },
    watchlist: { total: watch.length, freshness, oldest: oldest.slice(0, 10) },
  };
}

export function printReport(report, dbPath) {
  const fmtScope = (name, s) => {
    const m = s.missing;
    return `【${name}】${s.total} 款
  缺中文标题 ${m.titleZh} · 缺包装毛重 ${m.weight} · 缺包装尺寸 ${m.dimensions} · 缺上架天数 ${m.launch} · 缺 BSR ${m.bsr} · 缺精确月销 ${m.monthlySales}（只能卖家精灵补）
  Bright Data 可补：涉及 ${s.creditsNeeded} 款 ≈ ${s.creditsNeeded} credits（免费档 5000/月）`;
  };
  const lines = [
    `LINX 缺口扫描 · ${report.generatedAt}`,
    `库：${dbPath}（只读）`,
    `总览：${report.overview.total} 款 · pass ${report.overview.pass} · 已清除 ${report.overview.removed} · 收藏 ${report.overview.favorites} · 第二大脑 ${report.overview.brain}`,
    `跟进判定：收藏 ∪ 感兴趣 ∪ 手动钉住 ∪ 正向信号（${FOLLOWUP_EVENT_ACTIONS.join("/")}）`,
    "",
    fmtScope("跟进名单", report.scopes.followUp),
    "",
    fmtScope("第二大脑（模型正向挑选 + 手动升入）", report.scopes.brain),
    "",
    fmtScope(`评分 Top ${report.topN}`, report.scopes.top),
    "",
    fmtScope("全 pass 池（对照，不建议全量补）", report.scopes.passAll),
    "",
    `【观察名单新鲜度】跟进 ∪ Top${report.topN} 共 ${report.watchlist.total} 款：无记录 ${report.watchlist.freshness.none} · ≤14 天 ${report.watchlist.freshness.fresh} · 15-${report.staleDays} 天 ${report.watchlist.freshness.aging} · 超期 ${report.watchlist.freshness.stale}`,
  ];
  if (report.watchlist.oldest.length) {
    lines.push("  最旧 10 款：");
    for (const o of report.watchlist.oldest) lines.push(`    ${o.asin} ${String(o.title).slice(0, 40)}（${o.ageDays} 天前）`);
  }
  return lines.join("\n");
}

export function loadRows(dbPath) {
  if (!existsSync(dbPath)) throw new Error(`找不到数据库：${dbPath}`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const cols = new Set(db.prepare("PRAGMA table_info(products)").all().map((c) => c.name));
    const select = NEED_COLUMNS.filter((c) => cols.has(c));
    const products = db.prepare(`SELECT ${select.join(", ")} FROM products`).all();
    const events = db.prepare("SELECT asin, action, weight FROM feedback_events").all();
    const favorites = db.prepare("SELECT asin FROM favorites").all();
    return { products, events, favorites, tierColumn: cols.has("tier") };
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbPath = process.argv.includes("--db") ? process.argv[process.argv.indexOf("--db") + 1] : defaultDbPath;
  const { products, events, favorites } = loadRows(dbPath);
  const report = computeGapReport(products, events, favorites);
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else console.log(printReport(report, dbPath));
}
