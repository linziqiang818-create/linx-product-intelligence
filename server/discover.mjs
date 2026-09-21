// 自动采集（发现箱）：定期按关键词抓 Amazon 搜索页，本地预筛后抓详情页，新产品进「发现箱」等你审。
// 预算闸门是双保险（2026-09-18 定稿）：每日搜索/详情上限 + 月度总额硬停（免费档 5000 credits/月，1 credit=1 请求）。
// 采集流水线先干两件事：① 刷新跟进名单里最久没看过的产品（收藏 ∪ 感兴趣 ∪ 第二大脑，吃详情额度）；
// ② 再按关键词找新品进发现箱。已存在的产品不会因为关键词搜索被重复抓详情。
import { normalizeProduct, parseSales } from "./db.mjs";

export const DEFAULT_DISCOVERY_CONFIG = {
  keywords: [
    "sideboard buffet cabinet arched fluted",
    "pantry cabinet tambour curved scalloped",
    "storage cabinet wave ribbed geometric",
    "coffee bar cabinet mini fridge fluted",
    "tv stand media console curved tambour",
    "dresser chest rounded fluted modern",
    "dog crate furniture cabinet",
    "nail desk manicure table station",
    "reception desk front counter",
    "trash can cabinet kitchen",
  ],
  autoDaily: true,
  // 额度档位（2026-09-21 用户定稿：把免费档薅满）：30 搜索 + 120 详情 ≈ 150/天 ≈ 4500/月，
  // 月度硬停 5000 兜底；每个词多细看几款让详情额度真的用得掉
  dailySearchLimit: 30,
  dailyDetailLimit: 120,
  dailyRefreshLimit: 30,
  monthlyRequestCap: 5000,
  maxPerKeyword: 48,
  priceMin: 100,
  priceMax: 650,
};

const DAY_MS = 86_400_000;

export function normalizeDiscoveryConfig(raw = {}) {
  const c = { ...DEFAULT_DISCOVERY_CONFIG, ...raw };
  const words = Array.isArray(c.keywords) ? c.keywords : String(c.keywords ?? "").split("\n");
  c.keywords = words.map((k) => String(k).trim()).filter(Boolean).slice(0, 30);
  const int = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  c.autoDaily = Boolean(c.autoDaily);
  c.dailySearchLimit = int(c.dailySearchLimit, 0, 50, DEFAULT_DISCOVERY_CONFIG.dailySearchLimit);
  c.dailyDetailLimit = int(c.dailyDetailLimit, 0, 120, DEFAULT_DISCOVERY_CONFIG.dailyDetailLimit);
  c.dailyRefreshLimit = int(c.dailyRefreshLimit, 0, c.dailyDetailLimit, DEFAULT_DISCOVERY_CONFIG.dailyRefreshLimit);
  // 月度硬停上限最高 5000：免费档用完是硬停不计费，但留 1000 余量给手动临时补抓也更稳
  c.monthlyRequestCap = int(c.monthlyRequestCap, 0, 5000, DEFAULT_DISCOVERY_CONFIG.monthlyRequestCap);
  c.maxPerKeyword = int(c.maxPerKeyword, 1, 48, DEFAULT_DISCOVERY_CONFIG.maxPerKeyword);
  c.priceMin = Math.max(0, Number(c.priceMin) || DEFAULT_DISCOVERY_CONFIG.priceMin);
  c.priceMax = Math.max(c.priceMin, Number(c.priceMax) || DEFAULT_DISCOVERY_CONFIG.priceMax);
  return c;
}

const todayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const monthKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);

// 台账按日 + 按月双滚筒：日字段跨天清零，月总额跨月清零；手动/自动采集共用同一本账
export function getLedger(store, now = Date.now()) {
  const ledger = store.kvGet("discoveryLedger") ?? {};
  const fresh = { date: todayKey(now), month: monthKey(now), search: 0, detail: 0, monthTotal: 0 };
  if (ledger.date === fresh.date) {
    fresh.search = ledger.search ?? 0;
    fresh.detail = ledger.detail ?? 0;
  }
  if (ledger.month === fresh.month) fresh.monthTotal = ledger.monthTotal ?? 0;
  return fresh;
}
function spend(store, ledger, kind) {
  ledger[kind] = (ledger[kind] ?? 0) + 1;
  ledger.monthTotal = (ledger.monthTotal ?? 0) + 1;
  store.kvSet("discoveryLedger", ledger);
}
const monthlyExhausted = (ledger, config) => config.monthlyRequestCap > 0 && (ledger.monthTotal ?? 0) >= config.monthlyRequestCap;

// ---------- 解析器：容错优先，抓不到就留空（不瞎猜），字段缺失让正式规则和用户去判断 ----------

// 搜索页：真实瓦片结构是 ![标题alt](主图) ](链接含 /dp/ASIN)。以它为锚切块，块内取价格 / 评分 / 评论数
export function parseSearchPage(markdown) {
  const TILE = /!\[([^\]\n]{8,300})\]\((https?:\/\/m\.media-amazon\.com\/images\/I\/[^)\s]+)\)\s*\]\([^)]*?\/(?:dp|gp\/product)\/(B0[A-Z0-9]{8})[^)]*\)/g;
  const anchors = [...markdown.matchAll(TILE)];
  const items = [];
  const seen = new Set();
  for (let i = 0; i < anchors.length; i++) {
    const m = anchors[i];
    if (seen.has(m[3])) continue;
    seen.add(m[3]);
    const chunk = markdown.slice(m.index, i + 1 < anchors.length ? anchors[i + 1].index : m.index + 4000);
    const price = chunk.match(/\$\s?([\d,]+\.\d{2})/);
    const rating = chunk.match(/([\d.]+)\s*out of 5 stars/);
    const reviews = chunk.match(/\(([\d,]+)\)/);
    items.push({
      asin: m[3],
      title: decodeEntities(m[1]).replace(/\s+/g, " ").replace(/\.\.\.$/, "").trim(),
      imageUrl: upscaleImageUrl(m[2]),
      price: price ? Number(price[1].replace(/,/g, "")) : 0,
      rating: rating ? Number(rating[1]) : 0,
      reviews: reviews ? Number(reviews[1].replace(/,/g, "")) : 0,
    });
  }
  return items.filter((it) => it.title.length >= 15);
}

// 详情页：字段都从真实页面结构来（2026-09 用 B0F6CNTRHW 实测）；抓不到的留空
export function parseDetailPage(markdown, asin = "") {
  const text = markdown;
  const out = { asin, title: "", imageUrl: "", price: 0, rating: 0, reviews: 0, bsr: 0, category: "", weightLb: 0, dimensions: "", boughtPastMonth: "", brand: "" };

  const titleLine = text.match(/Amazon\.com:\s*([^\n]+)/);
  if (titleLine) out.title = decodeEntities(titleLine[1]).replace(/\s*:[^:]*$/, "").replace(/\s+/g, " ").trim().slice(0, 400);

  // 主图 = 图库里第一张带长 alt（标题级）的图；横幅/缩略图的 alt 都是空的，混不进来
  const hero = text.match(/!\[([^\]\n]{20,400})\]\((https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9%+_.-]+\.(?:jpg|jpeg|png|webp))[^)]*\)/);
  out.imageUrl = hero ? upscaleImageUrl(hero[2]) : upscaleImageUrl(text.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9%+_.-]+\.(?:jpg|jpeg|png|webp)/)?.[0] ?? "");

  // 主价格：优先取「bought in past month」后的第一个价格；没有就抓 Amazon 的双写价格（$199.99$199.99）；
  // 最后才取第一个前面不是延保 / 附加计划的散价（保护计划的坑实测存在）
  const boughtIdx = text.search(/bought in past month/i);
  const priceAfter = boughtIdx >= 0 ? text.slice(boughtIdx, boughtIdx + 600).match(/\$\s?([\d,]+\.\d{2})/) : null;
  if (priceAfter) out.price = Number(priceAfter[1].replace(/,/g, ""));
  if (!out.price) {
    const doubled = text.slice(0, 60_000).match(/\$\s?([\d,]+\.\d{2})[ ]?\$?[ ]?[\d,]*\.\d{2}/);
    if (doubled) out.price = Number(doubled[1].replace(/,/g, ""));
  }
  if (!out.price) {
    for (const m of text.slice(0, 40_000).matchAll(/\$\s?([\d,]+\.\d{2})/g)) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 10);
      if (/\/(month|count)|per /i.test(tail)) continue;
      if (/Protection|Warranty|Best Value|Plan/i.test(before)) continue;
      out.price = Number(m[1].replace(/,/g, ""));
      break;
    }
  }

  out.rating = Number(text.match(/([\d.]+)\s*out of 5 stars/)?.[1]) || 0;
  out.reviews = Number(text.match(/([\d,]+)\s+ratings?/)?.[1]?.replace(/,/g, "")) || Number(text.match(/\[\(([\d,]+)\)\]\(#averageCustomerReviews/)?.[1]?.replace(/,/g, "")) || 0;
  out.boughtPastMonth = text.match(/([\d,]+)\+?\s*bought in past month/i)?.[1] ?? "";

  const rankBase = text.indexOf("Best Sellers Rank");
  const rankText = rankBase >= 0 ? text.slice(rankBase, rankBase + 1200) : text;
  const ranks = [...rankText.matchAll(/#\s?([\d,]+)\s+in\s+\[?([^\]\n(]+)/g)];
  if (ranks.length) {
    out.bsr = Number(ranks[0][1].replace(/,/g, "")) || 0;
    out.category = ranks[ranks.length - 1][2].replace(/["\[\]]/g, "").trim();
  }

  const weight = text.match(/Item Weight\s*\n+\s*([\d.]+)\s*(pounds?|ounces?|kg)/i);
  if (weight) {
    const value = Number(weight[1]);
    out.weightLb = /oz/i.test(weight[2]) ? Math.round((value / 16) * 100) / 100 : /kg/i.test(weight[2]) ? Math.round(value * 2.205 * 100) / 100 : value;
  }
  const dims = text.match(/Item Dimensions(?:\s+D x W x H)?\s*\n+\s*([\d.]+)[^0-9]+([\d.]+)[^0-9]+([\d.]+)/i);
  if (dims) out.dimensions = `${dims[1]} x ${dims[2]} x ${dims[3]} inches`;

  out.brand = (text.match(/Manufacturer\s*\n+\s*([^\n]+)/) ?? text.match(/Brand\s*:?_?\s*\n+\s*([^\n]+)/))?.[1]?.trim() ?? "";
  return out;
}

const decodeEntities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

// Amazon 图床技巧：URL 里的尺寸码（_AC_SY300_SX300_...）可以换成 _AC_SL1500_ 拿高清原图
export function upscaleImageUrl(url) {
  return url ? url.replace(/\._[^.]+_\.(?=[a-z]+$)/i, "._AC_SL1500_.") : url;
}

// ---------- 预筛：只为省详情页的 credits，粗筛明显不做的；精确判定交给规则引擎和用户 ----------
const CASEGOOD_TERMS = /cabinet|sideboard|buffet|credenza|dresser|chest|nightstand|console|bookcase|bookshelf|shelf|shelving|pantry|vanity|desk|hutch|wardrobe|armoire|tv stand|media console|coffee table|end table|side table|dining table|kitchen island|entryway|hall tree|bench|storage|organizer|stand|table|pet|crate|litter|office|workstation|bar/i;
const OBVIOUS_NO_TERMS = /mattress|sofa|loveseat|couch|recliner|futon|futons|armchair|accent chair|dining chair|bar ?stool|stool|ottoman|bean bag|crib|bunk bed|baby|diaper|patio|outdoor|garden|hammock|swing|rug|carpet|curtain|lamp|ceiling|fan|toilet|shower|faucet|mirror only|bed frame|headboard|murphy bed/i;

export function prefilterCandidate(candidate, config) {
  if (!candidate.asin || candidate.title.length < 15) return { ok: false, reason: "标题太短" };
  if (candidate.price > 0 && (candidate.price < config.priceMin || candidate.price > config.priceMax)) return { ok: false, reason: `价格 $${candidate.price} 出带` };
  if (OBVIOUS_NO_TERMS.test(candidate.title)) return { ok: false, reason: "明显不做的品类" };
  if (!CASEGOOD_TERMS.test(candidate.title)) return { ok: false, reason: "不像板式家具" };
  return { ok: true, reason: "" };
}

function detailToRow(detail, keyword, now, fallbackImage = "") {
  return normalizeProduct({
    asin: detail.asin,
    title: detail.title,
    imageUrl: detail.imageUrl || fallbackImage,
    price: detail.price,
    rating: detail.rating,
    reviews: detail.reviews,
    bsr: detail.bsr,
    category: detail.category,
    brand: detail.brand,
    weight: detail.weightLb,
    packageDimensions: detail.dimensions,
    boughtPastMonth: detail.boughtPastMonth,
    sourceUrl: `https://www.amazon.com/dp/${detail.asin}`,
    discoveryKeyword: keyword,
    discoverySource: "auto",
    observedAt: new Date(now).toISOString(),
  });
}

// ---------- 主流程：刷新跟进名单 → 搜索 → 预筛 → 详情 → 进发现箱；单条失败跳过并记账，绝不阻断整批 ----------

// 刷新只更新"市场在变的"可观察字段（价/评/销/BSR/重量/主图），不动类目、标题、品牌这些身份字段——
// 它们是导入时的分类依据，被 Amazon BSR 文案覆盖会让产品在池里无谓搬家（轻量补数的边界，2026-09-18 定稿）。
function refreshStatement(store) {
  return store.db.prepare(`UPDATE products SET
      price = @price, rating = @rating, reviews = @reviews, bsr = @bsr,
      monthlySales = @monthlySales, monthlySalesRange = @monthlySalesRange,
      packageGrossKg = CASE WHEN @weightLb > 0 THEN ROUND(@weightLb / 2.205, 2) ELSE packageGrossKg END,
      packageDimensionsCm = CASE WHEN @dimensions != '' THEN @dimensions ELSE packageDimensionsCm END,
      imageUrl = CASE WHEN @imageUrl != '' THEN @imageUrl ELSE imageUrl END,
      observedAt = @observedAt, updatedAt = @observedAt
    WHERE asin = @asin`);
}

export async function runDiscovery(store, fetchPage, options = {}) {
  const config = normalizeDiscoveryConfig(options.config ?? store.kvGet("discoveryConfig"));
  const now = options.now ?? Date.now();
  const delayMs = options.delayMs ?? 4000; // 请求间隔：贴着免费号的自适应限流边缘走，宁慢勿烧
  const ledger = getLedger(store, now);
  const known = new Set(store.db.prepare("SELECT asin FROM products").all().map((r) => r.asin));
  const report = { at: new Date(now).toISOString(), keywords: [], searchRequests: 0, detailRequests: 0, kept: 0, refreshed: 0, refreshTotal: 0, errors: [] };
  const pause = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  const applyRefresh = refreshStatement(store);

  // 刷新阶段：跟进名单（收藏 ∪ 感兴趣 ∪ 第二大脑）里最久没看过的先看一遍；pass/已清除/发现箱永不烧额度
  const refreshBudget = Math.min(config.dailyRefreshLimit, Math.max(0, config.dailyDetailLimit - ledger.detail));
  if (refreshBudget > 0 && !monthlyExhausted(ledger, config)) {
    const followUps = store.db
      .prepare(`SELECT p.asin FROM products p
          LEFT JOIN favorites f ON f.asin = p.asin
          WHERE p.discoveryState IN ('', 'kept')
            AND (f.asin IS NOT NULL OR p.interest = 'interested' OR p.tier = 'brain')
          ORDER BY (COALESCE(p.observedAt, '') = '') DESC, p.observedAt ASC, p.asin ASC
          LIMIT ?`)
      .all(refreshBudget);
    report.refreshTotal = followUps.length;
    for (const { asin } of followUps) {
      if (ledger.detail >= config.dailyDetailLimit || monthlyExhausted(ledger, config)) break;
      await pause();
      try {
        spend(store, ledger, "detail");
        report.detailRequests++;
        const detail = parseDetailPage(await fetchPage(`https://www.amazon.com/dp/${asin}`), asin);
        if (!detail.title) { report.errors.push(`${asin}：刷新时没解析到页面，跳过`); continue; }
        const sales = parseSales(detail.boughtPastMonth);
        applyRefresh.run({
          asin,
          price: detail.price,
          rating: detail.rating,
          reviews: detail.reviews,
          bsr: detail.bsr,
          monthlySales: sales.value,
          monthlySalesRange: sales.range,
          weightLb: detail.weightLb,
          dimensions: detail.dimensions,
          imageUrl: detail.imageUrl,
          observedAt: new Date(now).toISOString(),
        });
        report.refreshed++;
      } catch (error) {
        report.errors.push(`${asin}：刷新失败 ${error.message}`);
      }
    }
  }

  const rows = [];
  for (const keyword of config.keywords) {
    if (monthlyExhausted(ledger, config)) { report.errors.push("月度额度已用完（免费档 5000/月硬停），次月自动归零恢复"); break; }
    if (ledger.search >= config.dailySearchLimit) { report.errors.push("搜索额度用完，剩余关键词下次再跑"); break; }
    if (ledger.detail >= config.dailyDetailLimit) { report.errors.push("详情额度用完，剩余候选下次再跑"); break; }
    const stat = { keyword, found: 0, newCount: 0, kept: 0, skippedExisting: 0, filtered: 0 };
    try {
      spend(store, ledger, "search");
      report.searchRequests++;
      const listings = parseSearchPage(await fetchPage(`https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`));
      stat.found = listings.length;
      const queue = [];
      for (const listing of listings) {
        if (known.has(listing.asin)) { stat.skippedExisting++; continue; }
        const verdict = prefilterCandidate(listing, config);
        if (!verdict.ok) { stat.filtered++; continue; }
        queue.push(listing);
        if (queue.length >= config.maxPerKeyword) break;
      }
      for (const candidate of queue) {
        if (monthlyExhausted(ledger, config)) { report.errors.push("月度额度已用完（免费档 5000/月硬停），次月自动归零恢复"); break; }
        if (ledger.detail >= config.dailyDetailLimit) { report.errors.push("详情额度用完，剩余候选下次再跑"); break; }
        await pause();
        try {
          spend(store, ledger, "detail");
          report.detailRequests++;
          const detail = parseDetailPage(await fetchPage(`https://www.amazon.com/dp/${candidate.asin}`), candidate.asin);
          if (!detail.title) { stat.filtered++; report.errors.push(`${candidate.asin}：详情页没解析到标题，跳过`); continue; }
          const row = detailToRow(detail, keyword, now, candidate.imageUrl);
          if (!row || !row.title) { stat.filtered++; continue; }
          known.add(candidate.asin);
          rows.push(row);
          stat.newCount++;
        } catch (error) {
          report.errors.push(`${candidate.asin}：${error.message}`);
        }
      }
    } catch (error) {
      stat.error = error.message;
      report.errors.push(`关键词「${keyword}」：${error.message}`);
    }
    stat.kept = stat.newCount;
    report.kept += stat.newCount;
    report.keywords.push(stat);
    await pause();
  }

  if (rows.length) {
    const result = store.upsertProducts(rows);
    const insert = store.db.prepare("UPDATE products SET discoveryState = 'new' WHERE asin = ?");
    for (const row of rows) insert.run(row.asin);
    report.inserted = result.inserted;
  }
  store.kvSet("lastDiscovery", report);
  return report;
}

// 服务启动/定时调用：条件不满足就返回 null（没配 key、没开自动、22 小时内跑过、日额度或月额度耗尽）
export async function autoDiscoveryIfDue(store, fetchPage, now = Date.now()) {
  const config = normalizeDiscoveryConfig(store.kvGet("discoveryConfig"));
  if (!config.autoDaily) return null;
  const last = store.kvGet("lastDiscovery");
  if (last?.at && now - Date.parse(last.at) < 22 * 3_600_000) return null;
  const ledger = getLedger(store, now);
  if (monthlyExhausted(ledger, config)) return null;
  if (ledger.search >= config.dailySearchLimit && ledger.detail >= config.dailyDetailLimit) return null;
  return runDiscovery(store, fetchPage, { config, now });
}
